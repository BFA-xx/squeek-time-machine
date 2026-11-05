import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { BANDS, CREWS, ROUNDS_PER_SHIFT, ROUND_SECONDS, TASK_DEFS, WORK_PER_CHAMBER, bandOf, chamberOf, chamberTarget, claimant, isBand, isCrew, isTask, pointsFor, roundAt, roundStart, shiftOfRound, shiftWindow, signTicket, verifyReceipt, type TaskSlug } from "@stm/shared";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { toJson } from "../common/serialize";
import { SqueekApiClient } from "../ingestion/squeek-api.client";
import { StreamService } from "../stream/stream.service";

const CREW_LOCK_MS = 24 * 3600_000;
const Account = z.object({ tokens: z.array(z.object({ tokenId: z.string(), level: z.number() }).passthrough()) }).passthrough();

/** Runs the game. It reads official records and only ever writes to the Dig tables. */
@Injectable()
export class DigService {
  constructor(private readonly db: PrismaService, private readonly stream: StreamService, private readonly api: SqueekApiClient) {}

  /** The current installation, its round clock, and the certified frontier. Rounds past the frontier are unknown, not zero. */
  async season() {
    const status = await this.db.lastGoodState.findUnique({ where: { key: "status" } });
    const id = (status?.body as { installationId?: string } | null)?.installationId
      ?? (await this.db.installation.findFirst({ where: { genesisTimestamp: { not: null } }, orderBy: { lastSeenAt: "desc" }, select: { id: true } }))?.id;
    if (!id) return null;
    const inst = await this.db.installation.findUnique({ where: { id } });
    if (!inst?.genesisTimestamp) return null;
    const top = await this.db.settlementRecord.findFirst({ where: { installationId: id }, orderBy: { settledThroughRound: "desc" } });
    return { id, genesis: inst.genesisTimestamp, frontier: top?.settledThroughRound ?? 0n, work: top?.cumulativeWork ?? 0n };
  }

  private async workThrough(installationId: string, round: bigint): Promise<bigint> {
    const [mining, settlement] = await Promise.all([
      this.db.miningRecord.findFirst({ where: { installationId, settledThroughRound: { lte: round } }, orderBy: { settledThroughRound: "desc" }, select: { cumulativeWork: true } }),
      this.db.settlementRecord.findFirst({ where: { installationId, settledThroughRound: { lte: round } }, orderBy: { settledThroughRound: "desc" }, select: { cumulativeWork: true } }),
    ]);
    const a = mining?.cumulativeWork ?? 0n;
    const b = settlement?.cumulativeWork ?? 0n;
    return a > b ? a : b;
  }

  /**
   * Settles every shift the frontier has passed, then every chamber real work has broken through.
   * A shift waits until the contract logs have been read past its settlement, so per-round
   * work is complete. Safe to run repeatedly: anything already settled is left alone.
   */
  async settle() {
    const season = await this.season();
    if (!season) return { shifts: 0, chambers: 0 };
    const { id } = season;
    const cursor = await this.db.ingestionCursor.findUnique({ where: { key: `chain.backfill:${id}` } });
    const scanned = cursor?.value ? BigInt(cursor.value) : null;
    const last = await this.db.digShift.findFirst({ where: { installationId: id }, orderBy: { index: "desc" }, select: { index: true } });
    let shifts = 0;
    for (let index = last ? last.index + 1 : 0; ; index++) {
      const w = shiftWindow(index);
      if (w.endRound > season.frontier) break;
      const closing = await this.db.settlementRecord.findFirst({ where: { installationId: id, settledThroughRound: { gte: w.endRound } }, orderBy: { settledThroughRound: "asc" } });
      if (!closing || scanned === null || scanned < closing.ethereumBlockNumber) break;
      const before = w.startRound > 1n ? await this.workThrough(id, w.startRound - 1n) : 0n;
      const after = await this.workThrough(id, w.endRound);
      const work = after - before;
      if (work < 0n) throw new Error(`shift ${index} has negative work`);
      const band = bandOf(work);
      const calls = await this.db.digCall.findMany({ where: { installationId: id, shiftIndex: index }, select: { userId: true, band: true } });
      const right = calls.filter((c) => c.band === band).length;
      const points = pointsFor(right, calls.length);
      await this.db.$transaction([
        this.db.digShift.create({ data: { id: `${id}:${index}`, installationId: id, index, startRound: w.startRound, endRound: w.endRound, workUnits: work, band, settledAt: closing.occurredAt, transactionHash: closing.transactionHash } }),
        this.db.digCall.updateMany({ where: { installationId: id, shiftIndex: index, band }, data: { correct: true, points } }),
        this.db.digCall.updateMany({ where: { installationId: id, shiftIndex: index, band: { not: band } }, data: { correct: false, points: 0 } }),
      ]);
      shifts++;
      this.stream.publish("dig", { kind: "shift", index, band, work: work.toString(), calls: calls.length, right });
    }
    const chambers = await this.settleChambers(id, season.work);
    return { shifts, chambers };
  }

  private async settleChambers(id: string, work: bigint) {
    const reached = chamberOf(work);
    const top = await this.db.digChamber.findFirst({ where: { installationId: id }, orderBy: { number: "desc" } });
    let made = 0;
    let since = top?.brokeAt ?? new Date(0);
    for (let n = (top?.number ?? 0) + 1; n <= reached; n++) {
      const target = chamberTarget(n);
      const hit = await this.db.settlementRecord.findFirst({ where: { installationId: id, cumulativeWork: { gte: target } }, orderBy: { settledThroughRound: "asc" } });
      if (!hit) break;
      const scored = await this.db.digShift.findMany({ where: { installationId: id, settledAt: { gt: since, lte: hit.occurredAt } }, select: { index: true } });
      const totals = await this.db.digCall.groupBy({ by: ["crew"], where: { installationId: id, shiftIndex: { in: scored.map((s) => s.index) } }, _sum: { points: true } });
      const given = await this.db.digContribution.groupBy({ by: ["crew"], where: { installationId: id, crew: { not: null }, createdAt: { gt: since, lte: hit.occurredAt } }, _sum: { points: true } });
      const tasks = await this.db.digTask.groupBy({ by: ["crew"], where: { installationId: id, createdAt: { gt: since, lte: hit.occurredAt } }, _sum: { points: true } });
      const scores: Record<string, number> = {};
      for (const t of tasks) scores[t.crew] = (scores[t.crew] ?? 0) + (t._sum.points ?? 0);
      for (const t of totals) scores[t.crew] = (scores[t.crew] ?? 0) + (t._sum.points ?? 0);
      for (const g of given) scores[g.crew!] = (scores[g.crew!] ?? 0) + (g._sum.points ?? 0);
      const crew = claimant(scores);
      await this.db.digChamber.create({ data: { installationId: id, number: n, target, brokeAt: hit.occurredAt, transactionHash: hit.transactionHash, crew } });
      since = hit.occurredAt;
      made++;
      this.stream.publish("dig", { kind: "chamber", number: n, crew });
    }
    return made;
  }

  /** Ownership can change at any time, so a shown Squeek gets checked again. An unreachable API changes nothing. */
  async recheckSqueeks(limit = 10) {
    const due = await this.db.digMember.findMany({ where: { squeekId: { not: null }, squeekCheckedAt: { lt: new Date(Date.now() - 3600_000) } }, take: limit, include: { user: { select: { walletAddress: true } } } });
    for (const m of due) {
      const owned = m.user.walletAddress ? await this.readSqueeks(m.user.walletAddress) : [];
      if (owned === null) continue;
      const still = owned.find((t) => t.tokenId === m.squeekId);
      await this.db.digMember.update({ where: { userId_installationId: { userId: m.userId, installationId: m.installationId } }, data: still ? { squeekLevel: still.level, squeekCheckedAt: new Date() } : { squeekId: null, squeekLevel: null, squeekCheckedAt: null } });
    }
  }

  private async readSqueeks(address: string): Promise<{ tokenId: string; level: number }[] | null> {
    const res = await this.api.get("dig", `/v1/accounts/${address.toLowerCase()}?limit=100`, Account);
    if (!res.ok || ("notModified" in res && res.notModified)) return null;
    return (res as { data: z.infer<typeof Account> }).data.tokens.map((t) => ({ tokenId: t.tokenId, level: t.level }));
  }

  async state(viewerId?: string, now = Date.now()) {
    const season = await this.season();
    if (!season) return { status: "unavailable" as const, reason: "The round clock isn't known yet." };
    const { id, genesis } = season;
    const nowS = Math.floor(now / 1000);
    const round = roundAt(genesis, nowS);
    const currentShift = shiftOfRound(round);
    const openIndex = currentShift + 1;
    const when = (r: bigint) => new Date(Number(roundStart(genesis, r)) * 1000);
    const describe = (index: number) => {
      const w = shiftWindow(index);
      return { index, startRound: w.startRound, endRound: w.endRound, startsAt: when(w.startRound), endsAt: new Date(when(w.endRound).getTime() + ROUND_SECONDS * 1000) };
    };
    const [results, chambers, crewPoints, crewCounts, topRows, liveCounts] = await Promise.all([
      this.db.digShift.findMany({ where: { installationId: id }, orderBy: { index: "desc" }, take: 12 }),
      this.db.digChamber.findMany({ where: { installationId: id }, orderBy: { number: "desc" }, take: 40 }),
      this.db.digCall.groupBy({ by: ["crew"], where: { installationId: id }, _sum: { points: true } }),
      this.db.digMember.groupBy({ by: ["crew"], where: { installationId: id }, _count: true }),
      this.db.digCall.groupBy({ by: ["userId"], where: { installationId: id, points: { gt: 0 } }, _sum: { points: true }, _count: true, orderBy: { _sum: { points: "desc" } }, take: 10 }),
      // Picks stay hidden until a shift locks, so nobody can just copy the crowd.
      this.db.digCall.groupBy({ by: ["shiftIndex", "band"], where: { installationId: id, shiftIndex: { lte: currentShift, gte: currentShift - 12 } }, _count: true }),
    ]);
    const openCount = await this.db.digCall.count({ where: { installationId: id, shiftIndex: openIndex } });
    const users = await this.db.user.findMany({ where: { id: { in: topRows.map((t) => t.userId) }, bannedAt: null }, select: { id: true, username: true, profile: { select: { displayName: true } }, digMembers: { where: { installationId: id }, select: { crew: true, squeekId: true, squeekLevel: true } } } });
    const leaderboard = topRows.flatMap((t) => {
      const u = users.find((x) => x.id === t.userId);
      if (!u) return [];
      const m = u.digMembers[0];
      return [{ username: u.username, displayName: u.profile?.displayName ?? null, points: t._sum.points ?? 0, wins: t._count, crew: m?.crew ?? null, squeekId: m?.squeekId ?? null, squeekLevel: m?.squeekLevel ?? null }];
    });
    const [crewGiven, recentGiven] = await Promise.all([
      this.db.digContribution.groupBy({ by: ["crew"], where: { installationId: id, crew: { not: null } }, _sum: { points: true } }),
      this.db.digContribution.findMany({ where: { installationId: id }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { username: true, bannedAt: true, profile: { select: { displayName: true } } } } } }),
    ]);
    const crewTasks = await this.db.digTask.groupBy({ by: ["crew"], where: { installationId: id }, _sum: { points: true } });
    const claimed = await this.db.digChamber.groupBy({ by: ["crew"], where: { installationId: id, crew: { not: null } }, _count: true });
    const crews = CREWS.map((c) => ({
      ...c,
      points: (crewPoints.find((p) => p.crew === c.slug)?._sum.points ?? 0) + (crewGiven.find((p) => p.crew === c.slug)?._sum.points ?? 0) + (crewTasks.find((p) => p.crew === c.slug)?._sum.points ?? 0),
      members: crewCounts.find((p) => p.crew === c.slug)?._count ?? 0,
      chambers: claimed.find((p) => p.crew === c.slug)?._count ?? 0,
    }));
    const splits = (index: number) => Object.fromEntries(BANDS.map((b) => [b.slug, liveCounts.find((l) => l.shiftIndex === index && l.band === b.slug)?._count ?? 0]));

    let me = null;
    if (viewerId) {
      const [member, call, calls] = await Promise.all([
        this.db.digMember.findUnique({ where: { userId_installationId: { userId: viewerId, installationId: id } } }),
        this.db.digCall.findUnique({ where: { userId_installationId_shiftIndex: { userId: viewerId, installationId: id, shiftIndex: openIndex } } }),
        this.db.digCall.findMany({ where: { userId: viewerId, installationId: id }, orderBy: { shiftIndex: "desc" }, take: 30 }),
      ]);
      const given = await this.db.digContribution.aggregate({ where: { userId: viewerId, installationId: id }, _sum: { points: true }, _count: true });
      const taskTotal = await this.db.digTask.aggregate({ where: { userId: viewerId, installationId: id }, _sum: { points: true } });
      const settled = calls.filter((c) => c.correct !== null);
      let streak = 0;
      for (const c of settled) {
        if (!c.correct) break;
        streak++;
      }
      me = {
        crew: member?.crew ?? null, joinedAt: member?.joinedAt ?? null, squeekId: member?.squeekId ?? null, squeekLevel: member?.squeekLevel ?? null,
        openCall: call?.band ?? null, contributed: given._sum.points ?? 0, contributions: given._count, tasks: await this.taskList(viewerId, id, now), taskPoints: taskTotal._sum.points ?? 0, points: settled.reduce((a, c) => a + (c.points ?? 0), 0) + (given._sum.points ?? 0) + (taskTotal._sum.points ?? 0), wins: settled.filter((c) => c.correct).length, played: settled.length, streak,
        recent: calls.slice(0, 12).map((c) => ({ shiftIndex: c.shiftIndex, band: c.band, correct: c.correct, points: c.points })),
      };
    }

    const reached = chamberOf(season.work);
    const base = chamberTarget(reached);
    return toJson({
      status: "available",
      installationId: id,
      round,
      frontier: season.frontier,
      work: season.work,
      chamber: { number: reached + 1, from: base, target: base + WORK_PER_CHAMBER, progressBps: Number(((season.work - base) * 10000n) / WORK_PER_CHAMBER) },
      roundsPerShift: ROUNDS_PER_SHIFT,
      shift: { open: { ...describe(openIndex), calls: openCount, locksAt: when(shiftWindow(openIndex).startRound) }, running: { ...describe(currentShift), picks: splits(currentShift) } },
      results: results.map((r) => ({ index: r.index, startRound: r.startRound, endRound: r.endRound, band: r.band, workUnits: r.workUnits, settledAt: r.settledAt, transactionHash: r.transactionHash, picks: splits(r.index) })),
      chambers: chambers.map((c) => ({ number: c.number, target: c.target, brokeAt: c.brokeAt, transactionHash: c.transactionHash, crew: c.crew })),
      crews,
      leaderboard,
      contributions: recentGiven.filter((c) => !c.user.bannedAt).map((c) => ({ txHash: c.txHash, kind: c.kind, points: c.points, tokenIds: c.tokenIds, at: c.createdAt, username: c.user.username, displayName: c.user.profile?.displayName ?? null })),
      me,
    });
  }

  /** What today's tasks look like for this player. The server works out each one from real rows, not from what a browser says. */
  private async taskList(userId: string, installationId: string, now: number) {
    const day = new Date(now).toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    const since = { gte: start };
    const [claimed, call, chain, memory] = await Promise.all([
      this.db.digTask.findMany({ where: { userId, installationId, day }, select: { task: true } }),
      this.db.digCall.count({ where: { userId, installationId, createdAt: since } }),
      this.db.digContribution.count({ where: { userId, installationId, createdAt: since, points: { gt: 0 } } }),
      this.db.communityMemory.count({ where: { userId, status: "visible", createdAt: since } }),
    ]);
    const ready: Partial<Record<TaskSlug, boolean>> = { call: call > 0, chain: chain > 0, memory: memory > 0 };
    return TASK_DEFS.map((t) => ({ ...t, claimed: claimed.some((c) => c.task === t.slug), ready: ready[t.slug] ?? false, room: t.slug === "together" || t.slug === "hello" }));
  }

  /** Credits a task once per UTC day. Wheel and hello tasks need a receipt signed by the multiplayer room. */
  async claimTask(user: { id: string }, slug: unknown, proof: unknown, now = Date.now()) {
    if (!isTask(slug)) throw new BadRequestException("That isn't one of today's tasks.");
    const { id } = await this.requireSeason();
    const member = await this.db.digMember.findUnique({ where: { userId_installationId: { userId: user.id, installationId: id } } });
    if (!member) throw new BadRequestException("Join a crew first.");
    const task = (await this.taskList(user.id, id, now)).find((t) => t.slug === slug)!;
    if (task.claimed) throw new ConflictException("You've already done that one today.");
    const done = task.room ? await verifyReceipt(proof, process.env.REALTIME_SECRET ?? "", user.id, slug as "together" | "hello", Math.floor(now / 1000)) : task.ready;
    if (!done) throw new BadRequestException("That task isn't done yet.");
    try {
      await this.db.digTask.create({ data: { userId: user.id, installationId: id, crew: member.crew, day: new Date(now).toISOString().slice(0, 10), task: slug, points: task.points } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ConflictException("You've already done that one today.");
      throw e;
    }
    this.stream.publish("dig", { kind: "task", task: slug, points: task.points });
    return { task: slug, points: task.points };
  }

  /** The pass for the multiplayer room. Only verified details go in, so nobody can pose as someone else. */
  async realtimeTicket(user: { id: string; username: string; profile?: { displayName: string | null } | null } | null | undefined) {
    const url = process.env.REALTIME_URL || null;
    const secret = process.env.REALTIME_SECRET ?? "";
    if (!url || !secret) return { url: null, ticket: null };
    if (!user) return { url, ticket: null };
    const season = await this.season();
    const member = season ? await this.db.digMember.findUnique({ where: { userId_installationId: { userId: user.id, installationId: season.id } } }) : null;
    const ticket = await signTicket({ u: user.id, n: user.username, d: user.profile?.displayName ?? null, c: member?.crew ?? null, q: member?.squeekId ?? null, l: member?.squeekLevel ?? null, exp: Math.floor(Date.now() / 1000) + 300 }, secret);
    return { url, ticket };
  }

  private async requireSeason() {
    const season = await this.season();
    if (!season) throw new ServiceUnavailableException("The round clock isn't known yet. Try again shortly.");
    return season;
  }

  async joinCrew(user: { id: string }, crew: unknown) {
    if (!isCrew(crew)) throw new BadRequestException("That crew doesn't exist.");
    const { id } = await this.requireSeason();
    const key = { userId_installationId: { userId: user.id, installationId: id } };
    const existing = await this.db.digMember.findUnique({ where: key });
    if (existing?.crew === crew) return { crew };
    if (existing && Date.now() - existing.joinedAt.getTime() < CREW_LOCK_MS) throw new HttpException("You can change crew once a day.", 429);
    await this.db.digMember.upsert({ where: key, update: { crew, joinedAt: new Date() }, create: { userId: user.id, installationId: id, crew } });
    this.stream.publish("dig", { kind: "crew" });
    return { crew };
  }

  /** A call is for the next shift only, and it locks when that shift starts. The server's clock decides. */
  async call(user: { id: string }, body: { band?: unknown }, now = Date.now()) {
    if (!isBand(body.band)) throw new BadRequestException("That isn't one of the calls.");
    const season = await this.requireSeason();
    const { id, genesis } = season;
    const member = await this.db.digMember.findUnique({ where: { userId_installationId: { userId: user.id, installationId: id } } });
    if (!member) throw new BadRequestException("Join a crew first.");
    const shiftIndex = shiftOfRound(roundAt(genesis, Math.floor(now / 1000))) + 1;
    const key = { userId_installationId_shiftIndex: { userId: user.id, installationId: id, shiftIndex } };
    if (await this.db.digCall.findUnique({ where: key })) throw new ConflictException("You've already made your call for this shift.");
    await this.db.digCall.create({ data: { userId: user.id, installationId: id, shiftIndex, band: body.band, crew: member.crew } });
    return { shiftIndex, band: body.band };
  }

  /** Lists the Squeeks a linked wallet holds right now. Cosmetic only: a Squeek gives no extra points. */
  async mySqueeks(user: { walletAddress: string | null }) {
    if (!user.walletAddress) return { wallet: null, squeeks: [] };
    const squeeks = await this.readSqueeks(user.walletAddress);
    if (squeeks === null) throw new ServiceUnavailableException("The official API can't confirm your Squeeks right now.");
    return { wallet: user.walletAddress, squeeks };
  }

  async showSqueek(user: { id: string; walletAddress: string | null }, tokenId: unknown) {
    const { id } = await this.requireSeason();
    const key = { userId_installationId: { userId: user.id, installationId: id } };
    if (!(await this.db.digMember.findUnique({ where: key }))) throw new BadRequestException("Join a crew first.");
    if (tokenId === null) {
      await this.db.digMember.update({ where: key, data: { squeekId: null, squeekLevel: null, squeekCheckedAt: null } });
      return { squeekId: null };
    }
    if (typeof tokenId !== "string" || !/^\d{1,6}$/.test(tokenId)) throw new BadRequestException("That isn't a Squeek number.");
    if (!user.walletAddress) throw new BadRequestException("Link the wallet that holds your Squeek first.");
    const owned = await this.readSqueeks(user.walletAddress);
    if (owned === null) throw new ServiceUnavailableException("The official API can't confirm your Squeeks right now.");
    const token = owned.find((t) => t.tokenId === tokenId);
    if (!token) throw new BadRequestException("Your linked wallet doesn't hold that Squeek.");
    await this.db.digMember.update({ where: key, data: { squeekId: tokenId, squeekLevel: token.level, squeekCheckedAt: new Date() } });
    return { squeekId: tokenId, squeekLevel: token.level };
  }
}
