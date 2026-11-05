import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { nextBlockStep, nextDistanceThresholds } from "@stm/shared";
import { PrismaService } from "../common/prisma.service";
import { toJson } from "../common/serialize";
import { FUTURE_NOTES, ORIGIN_ARTIFACTS } from "./origin";

/** A source this stale gets called out in the UI, even if its last call technically succeeded. */
const STALE_MS: Record<string, number> = { "api.status": 60_000, "api.events": 180_000, "api.core": 180_000, "api.settlements": 180_000 };

@Injectable()
export class ArchiveService {
  constructor(private readonly db: PrismaService) {}

  private async currentInstallationId(): Promise<string | null> {
    // /v1/status is the most available read, and it names the installation even when the indexers are down.
    const rows = await this.db.lastGoodState.findMany({ where: { key: { in: ["status", "core", "economy"] } }, orderBy: { fetchedAt: "desc" } });
    for (const r of rows) {
      const id = (r.body as { installationId?: string }).installationId;
      if (id) return id;
    }
    return null;
  }

  async worldState() {
    const [status, core, economy, sources, installationId, eventCount, memoryCount, latest] = await Promise.all([
      this.db.lastGoodState.findUnique({ where: { key: "status" } }),
      this.db.lastGoodState.findUnique({ where: { key: "core" } }),
      this.db.lastGoodState.findUnique({ where: { key: "economy" } }),
      this.db.dataSource.findMany({ orderBy: { key: "asc" } }),
      this.currentInstallationId(),
      this.db.historicalEvent.count(),
      this.db.communityMemory.count({ where: { status: "visible" } }),
      this.db.historicalEvent.findFirst({ where: { significance: { gte: 2 } }, orderBy: { occurredAt: "desc" }, select: { id: true, title: true, occurredAt: true, provisional: true } }),
    ]);
    const blockCount = installationId ? await this.db.blockRecord.count({ where: { installationId } }) : 0;
    const body = status?.body as { measurement?: Record<string, unknown>; builder?: { anchor?: Record<string, unknown>; projected?: Record<string, unknown> } } | null;
    const now = Date.now();
    return toJson({
      installationId,
      live: body
        ? {
            provisional: true,
            fetchedAt: status!.fetchedAt,
            ageMs: now - status!.fetchedAt.getTime(),
            measurement: body.measurement ?? null,
            settled: body.builder?.anchor ?? null,
            projected: body.builder?.projected ?? null,
          }
        : null,
      core: (core?.body as { core?: unknown } | null)?.core ?? null,
      economy: economy?.body ?? null,
      economyFetchedAt: economy?.fetchedAt ?? null,
      counts: { events: eventCount, blocks: blockCount, memories: memoryCount },
      latest,
      sources: sources.map((s) => ({
        key: s.key,
        status: s.status,
        reason: s.reason,
        lastSuccessAt: s.lastSuccessAt,
        stale: s.lastSuccessAt ? now - s.lastSuccessAt.getTime() > (STALE_MS[s.key] ?? 3_600_000) : true,
      })),
    });
  }

  async listEvents(q: { category?: string; type?: string; q?: string; cursor?: string; limit?: number; minSignificance?: number; before?: string; after?: string; provisional?: boolean; direction?: "desc" | "asc" }) {
    const limit = Math.min(Math.max(q.limit ?? 40, 1), 100);
    const where: Prisma.HistoricalEventWhereInput = {};
    if (q.category) where.categorySlug = q.category;
    if (q.type) where.type = q.type;
    if (q.q) where.searchText = { contains: q.q.toLowerCase().slice(0, 100) };
    if (q.minSignificance !== undefined) where.significance = { gte: q.minSignificance };
    if (q.before || q.after) where.occurredAt = { ...(q.before ? { lte: new Date(q.before) } : {}), ...(q.after ? { gte: new Date(q.after) } : {}) };
    const dir = q.direction === "asc" ? "asc" : "desc";
    const rows = await this.db.historicalEvent.findMany({
      where,
      orderBy: [{ occurredAt: dir }, { id: dir }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, type: true, categorySlug: true, title: true, summary: true, significance: true, occurredAt: true, provisional: true, confirmationStatus: true, transactionHash: true, sourceKind: true, installationId: true },
    });
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    const counts = await this.commentCounts(page.map((e) => `event:${e.id}`));
    return toJson({ events: page.map((e) => ({ ...e, comments: counts.get(`event:${e.id}`) ?? 0 })), nextCursor: more ? page[page.length - 1].id : null });
  }

  private async commentCounts(subjects: string[]) {
    const out = new Map<string, number>();
    if (!subjects.length) return out;
    const [c, m] = await Promise.all([
      this.db.comment.groupBy({ by: ["subject"], where: { subject: { in: subjects }, status: "visible" }, _count: true }),
      this.db.communityMemory.groupBy({ by: ["subject"], where: { subject: { in: subjects }, status: "visible" }, _count: true }),
    ]);
    for (const r of [...c, ...m]) out.set(r.subject, (out.get(r.subject) ?? 0) + r._count);
    return out;
  }

  async getEvent(id: string) {
    const e = await this.db.historicalEvent.findUnique({ where: { id }, include: { category: true, installation: { select: { id: true, releaseId: true } }, milestones: { select: { key: true, title: true } } } });
    if (!e) throw new NotFoundException("no such event");
    const pick = { id: true, title: true, type: true, categorySlug: true, occurredAt: true, provisional: true, significance: true } as const;
    const [before, after, sameTx, sameType, corrections] = await Promise.all([
      this.db.historicalEvent.findFirst({ where: { occurredAt: { lt: e.occurredAt }, significance: { gte: 2 } }, orderBy: { occurredAt: "desc" }, select: pick }),
      this.db.historicalEvent.findFirst({ where: { occurredAt: { gt: e.occurredAt }, significance: { gte: 2 } }, orderBy: { occurredAt: "asc" }, select: pick }),
      e.transactionHash ? this.db.historicalEvent.findMany({ where: { transactionHash: e.transactionHash, id: { not: e.id } }, take: 6, select: pick }) : [],
      this.db.historicalEvent.findMany({ where: { type: e.type, id: { not: e.id } }, orderBy: { occurredAt: "desc" }, take: 4, select: pick }),
      this.db.recordCorrection.findMany({ where: { recordType: "event", recordId: e.id }, orderBy: { createdAt: "asc" } }),
    ]);
    const settlement = e.type === "system.settlement_completed" && e.transactionHash ? await this.db.settlementRecord.findFirst({ where: { transactionHash: e.transactionHash } }) : null;
    const { searchText: _s, ...rest } = e;
    return toJson({ ...rest, settlement, corrections, related: { before, after, sameTransaction: sameTx, sameType } });
  }

  async listBlocks(q: { before?: string; limit?: number; installationId?: string }) {
    const installationId = q.installationId ?? (await this.currentInstallationId());
    if (!installationId) return { installationId: null, blocks: [], total: 0, nextBefore: null };
    const limit = Math.min(Math.max(q.limit ?? 60, 1), 2000);
    const rows = await this.db.blockRecord.findMany({
      where: { installationId, ...(q.before ? { height: { lt: BigInt(q.before) } } : {}) },
      orderBy: { height: "desc" },
      take: limit,
      select: { height: true, completedAt: true, settlementId: true },
    });
    const total = await this.db.blockRecord.count({ where: { installationId } });
    return toJson({ installationId, total, blocks: rows, nextBefore: rows.length === limit ? rows[rows.length - 1].height : null });
  }

  async getBlock(heightRaw: string, installationId?: string) {
    if (!/^\d{1,18}$/.test(heightRaw)) throw new NotFoundException("no such block");
    const inst = installationId ?? (await this.currentInstallationId());
    if (!inst) throw new NotFoundException("no such block");
    const height = BigInt(heightRaw);
    const b = await this.db.blockRecord.findUnique({ where: { installationId_height: { installationId: inst, height } }, include: { settlement: true } });
    if (!b) throw new NotFoundException("no such block");
    const [prev, next, event] = await Promise.all([
      this.db.blockRecord.findUnique({ where: { installationId_height: { installationId: inst, height: height - 1n } }, select: { height: true } }),
      this.db.blockRecord.findUnique({ where: { installationId_height: { installationId: inst, height: height + 1n } }, select: { height: true } }),
      this.db.historicalEvent.findFirst({ where: { transactionHash: b.settlement.transactionHash, type: "system.settlement_completed" }, select: { id: true, title: true } }),
    ]);
    return toJson({ ...b, previous: prev?.height ?? null, next: next?.height ?? null, event, note: "A Squeek block's time is the time its settlement reached Ethereum." });
  }

  async listSettlements(limit = 50) {
    return toJson(await this.db.settlementRecord.findMany({ orderBy: { occurredAt: "desc" }, take: Math.min(Math.max(limit, 1), 200) }));
  }

  async wheel() {
    const [stats, runs, status, installationId] = await Promise.all([
      this.db.lastGoodState.findUnique({ where: { key: "stats" } }),
      this.db.lastGoodState.findUnique({ where: { key: "runs" } }),
      this.db.lastGoodState.findUnique({ where: { key: "status" } }),
      this.currentInstallationId(),
    ]);
    const days = await this.db.wheelDay.findMany({ where: installationId ? { installationId } : undefined, orderBy: { date: "desc" }, take: 60 });
    return toJson({
      provenance: "Wheel figures are device measurements. Only settled work is certified on Ethereum.",
      stats: stats?.body ?? null,
      statsFetchedAt: stats?.fetchedAt ?? null,
      runs: runs?.body ?? null,
      days,
      live: (status?.body as { measurement?: unknown } | null)?.measurement ?? null,
    });
  }

  async evolution() {
    const installationId = await this.currentInstallationId();
    const installations = await this.db.installation.findMany({ orderBy: { firstSeenAt: "asc" }, select: { id: true, releaseId: true, genesisTimestamp: true, lastTotals: true } });
    const mining = installationId
      ? await this.db.miningRecord.findMany({ where: { installationId }, orderBy: { settledThroughRound: "asc" }, take: 5000, select: { capturedAt: true, blockHeight: true, cumulativeWork: true, workPerThousandBlocks: true, settledThroughRound: true, mintedBaseUnits: true, liveSupplyBaseUnits: true, stakedBaseUnits: true, nftLive: true, nftBurned: true } })
      : [];
    const merges = await this.db.historicalEvent.count({ where: { type: "nft.merged" } });
    const economy = await this.db.lastGoodState.findUnique({ where: { key: "economy" } });
    const settlements = await this.db.lastGoodState.findUnique({ where: { key: "settlements" } });
    return toJson({ installationId, installations, mining, merges, economy: economy?.body ?? null, economyFetchedAt: economy?.fetchedAt ?? null, settlements: settlements?.body ?? null });
  }

  async milestones(limit = 60) {
    return toJson(await this.db.milestone.findMany({ orderBy: { achievedAt: "desc" }, take: Math.min(limit, 200) }));
  }

  origin() {
    return { artifacts: ORIGIN_ARTIFACTS };
  }

  async future() {
    const [stats, core, economy] = await Promise.all([
      this.db.lastGoodState.findUnique({ where: { key: "stats" } }),
      this.db.lastGoodState.findUnique({ where: { key: "core" } }),
      this.db.lastGoodState.findUnique({ where: { key: "economy" } }),
    ]);
    const lifetime = (stats?.body as { lifetime?: { observedDistanceMm?: string } } | null)?.lifetime?.observedDistanceMm;
    const height = (core?.body as { core?: { blockHeight?: string } } | null)?.core?.blockHeight;
    const schedule = (economy?.body as { schedule?: { bonusBlocks?: string; halvingBlocks?: string } } | null)?.schedule;
    const locks: { key: string; title: string; detail: string; verification: string; target: string; current: string | null; unit: string }[] = [];
    if (lifetime) {
      for (const km of nextDistanceThresholds(BigInt(lifetime), 3)) {
        locks.push({ key: `distance-${km}`, title: `${km} km lifetime`, detail: "A documented lifetime distance milestone. It unlocks when the official feed records it.", verification: "verified", target: String(km * 1_000_000), current: lifetime, unit: "mm" });
      }
    }
    if (height) {
      const next = nextBlockStep(BigInt(height));
      if (next) locks.push({ key: `block-${next}`, title: `Block ${next}`, detail: "An archive milestone. It unlocks when a settlement reaches this height.", verification: "verified", target: next.toString(), current: height, unit: "blocks" });
      if (schedule?.bonusBlocks && BigInt(height) < BigInt(schedule.bonusBlocks)) {
        locks.push({ key: "bonus-end", title: "End of the launch bonus", detail: "The published schedule's launch bonus runs for this many blocks. Testnet values can change.", verification: "verified", target: schedule.bonusBlocks, current: height, unit: "blocks" });
      }
      if (schedule?.halvingBlocks && BigInt(height) < BigInt(schedule.halvingBlocks)) {
        locks.push({ key: "halving-1", title: "First halving", detail: "The published schedule halves issuance at this block count. Testnet values can change.", verification: "verified", target: schedule.halvingBlocks, current: height, unit: "blocks" });
      }
    }
    return toJson({ notes: FUTURE_NOTES, locks });
  }

  async search(q: string) {
    const term = q.trim().slice(0, 100);
    if (term.length < 2) return { events: [], block: null, milestones: [] };
    const [events, block, milestones] = await Promise.all([
      this.db.historicalEvent.findMany({ where: { searchText: { contains: term.toLowerCase() } }, orderBy: [{ significance: "desc" }, { occurredAt: "desc" }], take: 12, select: { id: true, title: true, type: true, categorySlug: true, occurredAt: true, provisional: true } }),
      /^\d{1,12}$/.test(term) ? this.getBlock(term).catch(() => null) : null,
      this.db.milestone.findMany({ where: { title: { contains: term, mode: "insensitive" } }, take: 6, orderBy: { achievedAt: "desc" } }),
    ]);
    return toJson({ events, block, milestones });
  }
}
