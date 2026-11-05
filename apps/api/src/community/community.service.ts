import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { LIMITS, REACTIONS, checkUserText, parseSubject } from "@stm/shared";
import { PrismaService } from "../common/prisma.service";
import { toJson } from "../common/serialize";
import { StreamService } from "../stream/stream.service";

const WINDOWS = { memory: [[60_000, 3], [3_600_000, 20]], comment: [[60_000, 6], [3_600_000, 60]], poll: [[3_600_000, 3]], reaction: [[60_000, 40]], vote: [[60_000, 20]], report: [[3_600_000, 20]] } as const;
const REASON_TEXT: Record<string, string> = {
  empty: "Write something first.",
  too_long: "That's too long.",
  links_blocked: "Links aren't allowed here, except to squeekchain.com and etherscan.io.",
  seed_phrase: "That reads like a wallet scam, so it can't be posted here.",
  repetitive: "That looks like spam.",
};
const AUTO_HIDE_REPORTS = 3;

@Injectable()
export class CommunityService {
  constructor(private readonly db: PrismaService, private readonly stream: StreamService) {}

  private clean(text: unknown, max: number): string {
    if (typeof text !== "string") throw new BadRequestException("Write something first.");
    const r = checkUserText(text, max);
    if (!r.ok) throw new BadRequestException(REASON_TEXT[r.reason!] ?? "That can't be posted.");
    return r.text;
  }

  /** Per-account limits sit on top of the per-IP throttle, because one account shouldn't flood from many addresses. */
  private async rateLimit(userId: string, kind: keyof typeof WINDOWS) {
    for (const [ms, max] of WINDOWS[kind]) {
      const used = await this.db.userContribution.count({ where: { userId, kind, createdAt: { gte: new Date(Date.now() - ms) } } });
      if (used >= max) throw new HttpException("You're doing that too often. Try again shortly.", 429);
    }
  }

  private async assertSubject(subject: unknown): Promise<string> {
    if (typeof subject !== "string") throw new BadRequestException("Unknown subject.");
    const p = parseSubject(subject);
    if (!p) throw new BadRequestException("Unknown subject.");
    let found: unknown = null;
    if (p.kind === "event") found = await this.db.historicalEvent.findUnique({ where: { id: p.id }, select: { id: true } });
    else if (p.kind === "block") found = /^\d{1,18}$/.test(p.id) ? await this.db.blockRecord.findFirst({ where: { height: BigInt(p.id) }, select: { height: true } }) : null;
    else if (p.kind === "memory") found = await this.db.communityMemory.findFirst({ where: { id: p.id, status: "visible" }, select: { id: true } });
    else if (p.kind === "comment") found = await this.db.comment.findFirst({ where: { id: p.id, status: "visible" }, select: { id: true } });
    else if (p.kind === "poll") found = await this.db.poll.findFirst({ where: { id: p.id, status: "visible" }, select: { id: true } });
    if (!found) throw new NotFoundException("That record doesn't exist.");
    return subject;
  }

  private contribution(userId: string, kind: string, subject: string, refId?: string, excerpt?: string) {
    return this.db.userContribution.create({ data: { userId, kind, subject, refId, excerpt: excerpt?.slice(0, 140) } });
  }

  async createMemory(user: { id: string; username: string }, body: { subject?: unknown; body?: unknown; kind?: unknown }) {
    await this.rateLimit(user.id, "memory");
    const kind = body.kind === "observation" || body.kind === "expectation" ? body.kind : "memory";
    const text = this.clean(body.body, LIMITS.memory);
    const subject = kind === "expectation" && body.subject === undefined ? "future:general" : await this.assertSubject(body.subject);
    if (await this.db.communityMemory.findFirst({ where: { userId: user.id, subject, body: text } })) throw new ConflictException("You've already posted that here.");
    const m = await this.db.communityMemory.create({ data: { userId: user.id, subject, kind, body: text } });
    await this.contribution(user.id, "memory", subject, m.id, text);
    this.stream.publish("community", { kind: "memory", id: m.id, subject, username: user.username, body: text, at: m.createdAt });
    return { ...m, username: user.username };
  }

  async listMemories(q: { subject?: string; kind?: string; limit?: number; cursor?: string }) {
    const rows = await this.db.communityMemory.findMany({
      where: { status: "visible", ...(q.subject ? { subject: q.subject } : {}), ...(q.kind ? { kind: q.kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(q.limit ?? 30, 100),
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { user: { select: { username: true } } },
    });
    return this.withReactions(rows.map((m) => ({ id: m.id, subject: m.subject, kind: m.kind, body: m.body, createdAt: m.createdAt, username: m.user.username })), "memory");
  }

  private async withReactions<T extends { id: string }>(rows: T[], kind: "memory" | "comment") {
    const subjects = rows.map((r) => `${kind}:${r.id}`);
    const counts = subjects.length ? await this.db.reaction.groupBy({ by: ["subject", "kind"], where: { subject: { in: subjects } }, _count: true }) : [];
    return rows.map((r) => ({ ...r, reactions: Object.fromEntries(counts.filter((c) => c.subject === `${kind}:${r.id}`).map((c) => [c.kind, c._count])) }));
  }

  async createComment(user: { id: string; username: string }, body: { subject?: unknown; body?: unknown; parentId?: unknown }) {
    await this.rateLimit(user.id, "comment");
    const subject = await this.assertSubject(body.subject);
    const text = this.clean(body.body, LIMITS.comment);
    let parentId: string | null = null;
    if (typeof body.parentId === "string") {
      const parent = await this.db.comment.findFirst({ where: { id: body.parentId, subject, status: "visible" } });
      if (!parent) throw new NotFoundException("That comment doesn't exist.");
      parentId = parent.id;
    }
    if (await this.db.comment.findFirst({ where: { userId: user.id, subject, body: text, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })) throw new ConflictException("You've already posted that here.");
    const c = await this.db.comment.create({ data: { userId: user.id, subject, parentId, body: text } });
    await this.contribution(user.id, "comment", subject, c.id, text);
    this.stream.publish("community", { kind: "comment", id: c.id, subject, username: user.username, body: text, at: c.createdAt });
    return { ...c, username: user.username };
  }

  async listComments(subject: string, limit = 50) {
    if (!parseSubject(subject)) throw new BadRequestException("Unknown subject.");
    const rows = await this.db.comment.findMany({ where: { subject, status: "visible" }, orderBy: { createdAt: "asc" }, take: Math.min(limit, 200), include: { user: { select: { username: true } } } });
    return this.withReactions(rows.map((c) => ({ id: c.id, subject: c.subject, parentId: c.parentId, body: c.body, createdAt: c.createdAt, username: c.user.username })), "comment");
  }

  async toggleReaction(user: { id: string }, body: { subject?: unknown; kind?: unknown }) {
    await this.rateLimit(user.id, "reaction");
    const subject = await this.assertSubject(body.subject);
    if (!REACTIONS.includes(body.kind as (typeof REACTIONS)[number])) throw new BadRequestException("Unknown reaction.");
    const kind = body.kind as string;
    const key = { userId_subject_kind: { userId: user.id, subject, kind } };
    const existing = await this.db.reaction.findUnique({ where: key });
    if (existing) await this.db.reaction.delete({ where: key });
    else {
      await this.db.reaction.create({ data: { userId: user.id, subject, kind } });
      await this.contribution(user.id, "reaction", subject);
    }
    const count = await this.db.reaction.count({ where: { subject, kind } });
    return { subject, kind, active: !existing, count };
  }

  async reactionsFor(subject: string) {
    const counts = await this.db.reaction.groupBy({ by: ["kind"], where: { subject }, _count: true });
    return Object.fromEntries(counts.map((c) => [c.kind, c._count]));
  }

  async createPoll(user: { id: string }, body: { question?: unknown; options?: unknown; scope?: unknown }) {
    await this.rateLimit(user.id, "poll");
    const question = this.clean(body.question, LIMITS.pollQuestion);
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 6) throw new BadRequestException("A poll needs 2 to 6 options.");
    const labels = body.options.map((o) => this.clean(o, LIMITS.pollOption));
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) throw new BadRequestException("Poll options must be different.");
    const poll = await this.db.poll.create({ data: { userId: user.id, question, scope: body.scope === "future" ? "future" : "general", options: { create: labels.map((label, order) => ({ label, order })) } }, include: { options: true } });
    await this.contribution(user.id, "poll", `poll:${poll.id}`, poll.id, question);
    this.stream.publish("community", { kind: "poll", id: poll.id, question });
    return poll;
  }

  async listPolls(scope?: string, viewerId?: string) {
    const polls = await this.db.poll.findMany({
      where: { status: "visible", ...(scope ? { scope } : {}) },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { username: true } }, options: { orderBy: { order: "asc" }, include: { _count: { select: { votes: true } } } } },
    });
    const mine = viewerId ? await this.db.pollVote.findMany({ where: { userId: viewerId, pollId: { in: polls.map((p) => p.id) } } }) : [];
    return polls.map((p) => ({
      id: p.id, question: p.question, scope: p.scope, createdAt: p.createdAt, username: p.user.username,
      options: p.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes })),
      myVote: mine.find((v) => v.pollId === p.id)?.optionId ?? null,
    }));
  }

  async vote(user: { id: string }, pollId: string, optionId: unknown) {
    await this.rateLimit(user.id, "vote");
    const poll = await this.db.poll.findFirst({ where: { id: pollId, status: "visible" }, include: { options: true } });
    if (!poll) throw new NotFoundException("That poll doesn't exist.");
    if (typeof optionId !== "string" || !poll.options.some((o) => o.id === optionId)) throw new BadRequestException("That isn't an option in this poll.");
    const key = { pollId_userId: { pollId, userId: user.id } };
    if (await this.db.pollVote.findUnique({ where: key })) throw new ConflictException("You've already voted in this poll.");
    await this.db.pollVote.create({ data: { pollId, userId: user.id, optionId } });
    await this.contribution(user.id, "vote", `poll:${pollId}`);
    return { ok: true };
  }

  async report(user: { id: string }, body: { subject?: unknown; reason?: unknown }) {
    await this.rateLimit(user.id, "report");
    if (typeof body.subject !== "string") throw new BadRequestException("Unknown subject.");
    const p = parseSubject(body.subject);
    if (!p || !["memory", "comment", "poll"].includes(p.kind)) throw new BadRequestException("Only community posts can be reported.");
    const reason = this.clean(body.reason ?? "No reason given", LIMITS.report);
    await this.assertSubject(body.subject);
    const dup = await this.db.moderationReport.findUnique({ where: { subject_reporterId: { subject: body.subject, reporterId: user.id } } });
    if (dup) return { ok: true };
    await this.db.moderationReport.create({ data: { subject: body.subject, reporterId: user.id, reason } });
    await this.contribution(user.id, "report", body.subject);
    const open = await this.db.moderationReport.count({ where: { subject: body.subject, status: "open" } });
    // Several independent reports hide a post until a moderator looks. A moderator can restore it.
    if (open >= AUTO_HIDE_REPORTS) await this.setPostStatus(body.subject, "hidden");
    return { ok: true };
  }

  private async setPostStatus(subject: string, status: "visible" | "hidden") {
    const p = parseSubject(subject)!;
    if (p.kind === "memory") await this.db.communityMemory.updateMany({ where: { id: p.id }, data: { status } });
    else if (p.kind === "comment") await this.db.comment.updateMany({ where: { id: p.id }, data: { status } });
    else if (p.kind === "poll") await this.db.poll.updateMany({ where: { id: p.id }, data: { status } });
  }

  private async postAuthor(subject: string) {
    const p = parseSubject(subject)!;
    if (p.kind === "memory") return (await this.db.communityMemory.findUnique({ where: { id: p.id } }))?.userId;
    if (p.kind === "comment") return (await this.db.comment.findUnique({ where: { id: p.id } }))?.userId;
    if (p.kind === "poll") return (await this.db.poll.findUnique({ where: { id: p.id } }))?.userId;
    return undefined;
  }

  adminReports() {
    return this.db.moderationReport.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" }, take: 100, include: { reporter: { select: { username: true } } } });
  }

  async resolveReport(id: string, action: unknown) {
    const report = await this.db.moderationReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("No such report.");
    if (action !== "hide" && action !== "restore" && action !== "ban") throw new ForbiddenException("Use hide, restore or ban.");
    await this.setPostStatus(report.subject, action === "restore" ? "visible" : "hidden");
    if (action === "ban") {
      const author = await this.postAuthor(report.subject);
      if (author) {
        await this.db.user.update({ where: { id: author }, data: { bannedAt: new Date() } });
        await this.db.session.deleteMany({ where: { userId: author } });
      }
    }
    await this.db.moderationReport.updateMany({ where: { subject: report.subject, status: "open" }, data: { status: action === "restore" ? "dismissed" : "upheld", resolvedAt: new Date(), resolution: action } });
    return { ok: true };
  }

  async feed(limit = 30) {
    const rows = await this.db.userContribution.findMany({ where: { kind: { in: ["memory", "comment", "poll"] } }, orderBy: { createdAt: "desc" }, take: Math.min(limit * 2, 100), include: { user: { select: { username: true, bannedAt: true } } } });
    const hidden = new Set<string>();
    const mem = rows.filter((r) => r.kind === "memory" && r.refId).map((r) => r.refId!);
    const com = rows.filter((r) => r.kind === "comment" && r.refId).map((r) => r.refId!);
    const pol = rows.filter((r) => r.kind === "poll" && r.refId).map((r) => r.refId!);
    (await this.db.communityMemory.findMany({ where: { id: { in: mem }, status: "hidden" }, select: { id: true } })).forEach((x) => hidden.add(x.id));
    (await this.db.comment.findMany({ where: { id: { in: com }, status: "hidden" }, select: { id: true } })).forEach((x) => hidden.add(x.id));
    (await this.db.poll.findMany({ where: { id: { in: pol }, status: "hidden" }, select: { id: true } })).forEach((x) => hidden.add(x.id));
    return rows.filter((r) => !r.user.bannedAt && !(r.refId && hidden.has(r.refId))).slice(0, limit).map((r) => ({ id: r.id, kind: r.kind, subject: r.subject, excerpt: r.excerpt, createdAt: r.createdAt, username: r.user.username }));
  }

  async discovery() {
    const [comments, memories, reactions, recent] = await Promise.all([
      this.db.comment.groupBy({ by: ["subject"], where: { status: "visible", subject: { startsWith: "event:" } }, _count: true, orderBy: { _count: { subject: "desc" } }, take: 8 }),
      this.db.communityMemory.groupBy({ by: ["subject"], where: { status: "visible", subject: { startsWith: "event:" } }, _count: true, orderBy: { _count: { subject: "desc" } }, take: 8 }),
      this.db.reaction.groupBy({ by: ["subject"], where: { subject: { startsWith: "memory:" } }, _count: true, orderBy: { _count: { subject: "desc" } }, take: 8 }),
      this.listMemories({ limit: 8 }),
    ]);
    const ids = [...comments, ...memories].map((c) => c.subject.slice(6));
    const events = await this.db.historicalEvent.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, occurredAt: true } });
    const titled = (rows: { subject: string; _count: number }[]) => rows.flatMap((r) => {
      const e = events.find((x) => x.id === r.subject.slice(6));
      return e ? [{ ...e, count: r._count }] : [];
    });
    const popularIds = reactions.map((r) => r.subject.slice(7));
    const popular = await this.db.communityMemory.findMany({ where: { id: { in: popularIds }, status: "visible" }, include: { user: { select: { username: true } } } });
    const popularMemories = reactions.flatMap((r) => {
      const m = popular.find((x) => x.id === r.subject.slice(7));
      return m ? [{ id: m.id, subject: m.subject, kind: m.kind, body: m.body, username: m.user.username, createdAt: m.createdAt, count: r._count }] : [];
    });
    return toJson({ mostDiscussed: titled(comments), mostRemembered: titled(memories), popularMemories, recentMemories: recent });
  }

  async profile(username: string) {
    const user = await this.db.user.findUnique({ where: { usernameLower: username.toLowerCase() }, include: { profile: true } });
    if (!user || user.bannedAt) throw new NotFoundException("No such user.");
    const contributions = await this.db.userContribution.findMany({ where: { userId: user.id, kind: { in: ["memory", "comment", "poll"] } }, orderBy: { createdAt: "desc" }, take: 50 });
    const totals = await this.db.userContribution.groupBy({ by: ["kind"], where: { userId: user.id }, _count: true });
    return { username: user.username, wallet: user.walletAddress, bio: user.profile?.bio ?? "", joinedAt: user.createdAt, contributions, totals: Object.fromEntries(totals.map((t) => [t.kind, t._count])) };
  }

  async updateProfile(user: { id: string }, body: { bio?: unknown }) {
    const bio = body.bio === "" ? "" : this.clean(body.bio, LIMITS.bio);
    await this.db.userProfile.upsert({ where: { userId: user.id }, update: { bio }, create: { userId: user.id, bio } });
    return { bio };
  }

  async share(subject: unknown) {
    if (typeof subject !== "string" || !parseSubject(subject)) throw new BadRequestException("Unknown subject.");
    await this.db.shareRecord.create({ data: { subject } });
    return { count: await this.db.shareRecord.count({ where: { subject } }) };
  }
}
