import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { DigService } from "../src/dig/dig.service";
import { SqueekApiClient } from "../src/ingestion/squeek-api.client";
import { fakeFetch, makeApp, wipe } from "./helpers";

const INST = "dig-test";
const GENESIS = 1_800_000_000n;
const roundTime = (r: number) => (Number(GENESIS) + (r - 1) * 600) * 1000;
let app: INestApplication, db: PrismaService, dig: DigService;
let n = 0;

async function member(crew?: string) {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/v1/auth/register").send({ username: `dig_${++n}`, password: "correct-horse-battery" }).expect(201);
  if (crew) await agent.post("/v1/dig/crew").send({ crew }).expect(200);
  return agent;
}

/** A settlement at a round, with its work total. `scan` says how far the contract logs have been read. */
async function settle(round: number, work: number, block = 1000 + round) {
  const tx = `0x${round.toString(16).padStart(64, "0")}`;
  await db.settlementRecord.create({ data: {
    id: `${tx}:1`, installationId: INST, transactionHash: tx, logIndex: 1, ethereumBlockNumber: BigInt(block), occurredAt: new Date(roundTime(round + 1)), previousRound: BigInt(round - 1),
    settledThroughRound: BigInt(round), activeRoundCount: 1, workAdded: 0n, cumulativeWork: BigInt(work), cumulativeBlockUnits: "0", blockHeight: 0n, completedBlockCount: 0n, confirmationStatus: "safe", source: "chain",
  } });
}
const scanTo = (block: number) => db.ingestionCursor.upsert({ where: { key: `chain.backfill:${INST}` }, update: { value: String(block) }, create: { key: `chain.backfill:${INST}`, value: String(block) } });

beforeAll(async () => {
  app = await makeApp();
  db = app.get(PrismaService);
  dig = app.get(DigService);
});
afterAll(() => app.close());
beforeEach(async () => {
  await wipe(db);
  vi.useRealTimers();
  await db.installation.create({ data: { id: INST, genesisTimestamp: GENESIS } });
  await db.lastGoodState.create({ data: { key: "status", fetchedAt: new Date(), body: { installationId: INST } } });
});

describe("settling on real rounds", () => {
  it("doesn't settle a shift until the frontier passes it: unknown isn't zero", async () => {
    await settle(35, 500);
    await scanTo(99999);
    expect((await dig.settle()).shifts).toBe(0);
    expect(await db.digShift.count()).toBe(0);
  });
  it("waits until the contract logs have been read past the settlement", async () => {
    await settle(36, 500, 2000);
    await scanTo(1999);
    expect((await dig.settle()).shifts).toBe(0);
    await scanTo(2000);
    expect((await dig.settle()).shifts).toBe(1);
  });
  it("works out a shift's work from certified totals and picks the right band", async () => {
    await settle(36, 500);
    await settle(72, 500);
    await settle(108, 1700);
    await scanTo(99999);
    await dig.settle();
    const rows = await db.digShift.findMany({ orderBy: { index: "asc" } });
    expect(rows.map((r) => [Number(r.workUnits), r.band])).toEqual([[500, "running"], [0, "asleep"], [1200, "sprinting"]]);
    expect(rows[0].transactionHash).toMatch(/^0x/);
  });
  it("is safe to run twice", async () => {
    await settle(36, 500);
    await scanTo(99999);
    await dig.settle();
    expect(await dig.settle()).toEqual({ shifts: 0, chambers: 0 });
    expect(await db.digShift.count()).toBe(1);
  });
  it("splits a settlement that crosses a shift's end using per-round records", async () => {
    await settle(40, 900);
    await db.miningRecord.create({ data: { installationId: INST, capturedAt: new Date(), safeBlock: 1n, blockHeight: 0n, cumulativeWork: 200n, workPerThousandBlocks: 9000, settledThroughRound: 30n } });
    await scanTo(99999);
    await dig.settle();
    const s = await db.digShift.findFirstOrThrow();
    expect(Number(s.workUnits)).toBe(200);
    expect(s.band).toBe("stirring");
  });
});

describe("calls", () => {
  it("needs an account and a crew", async () => {
    await request(app.getHttpServer()).post("/v1/dig/call").send({ band: "asleep" }).expect(401);
    const a = await member();
    await a.post("/v1/dig/call").send({ band: "asleep" }).expect(400);
  });
  it("takes one call per shift, for the next shift only", async () => {
    vi.spyOn(Date, "now").mockReturnValue(roundTime(10));
    const a = await member("nightshift");
    const r = await a.post("/v1/dig/call").send({ band: "running" }).expect(200);
    expect(r.body.shiftIndex).toBe(1);
    await a.post("/v1/dig/call").send({ band: "asleep" }).expect(409);
    await a.post("/v1/dig/call").send({ band: "nonsense" }).expect(400);
  });
  it("a late call goes to the following shift, so nobody can call a shift that's already running", async () => {
    const a = await member("nightshift");
    const justAfterLock = roundTime(37) + 1000;
    const r = await dig.call({ id: (await db.user.findFirstOrThrow()).id }, { band: "asleep" }, justAfterLock);
    expect(r.shiftIndex).toBe(2);
    void a;
  });
  it("hides the crowd's picks until the shift locks", async () => {
    const before = roundTime(10);
    vi.spyOn(Date, "now").mockReturnValue(before);
    const a = await member("nightshift");
    await a.post("/v1/dig/call").send({ band: "running" }).expect(200);
    const open = await dig.state(undefined, before) as { shift: { open: Record<string, unknown>; running: { picks: Record<string, number> } } };
    expect(open.shift.open.calls).toBe(1);
    expect(open.shift.open.picks).toBeUndefined();
    const later = await dig.state(undefined, roundTime(40)) as { shift: { running: { picks: Record<string, number> } } };
    expect(later.shift.running.picks.running).toBe(1);
  });
  it("pays the people who were right, more when most were wrong", async () => {
    vi.spyOn(Date, "now").mockReturnValue(roundTime(1));
    const [a, b, c, d] = [await member("nightshift"), await member("cheekpouch"), await member("cheekpouch"), await member("sandbath")];
    await a.post("/v1/dig/call").send({ band: "sprinting" }).expect(200);
    for (const x of [b, c, d]) await x.post("/v1/dig/call").send({ band: "asleep" }).expect(200);
    vi.restoreAllMocks();
    await settle(72, 1500);
    await scanTo(99999);
    await dig.settle();
    const calls = await db.digCall.findMany({ where: { band: "sprinting" } });
    expect(calls[0].points).toBe(10 + Math.floor((90 * 3) / 4));
    expect(await db.digCall.count({ where: { correct: false, points: 0 } })).toBe(3);
    const s = await dig.state() as { crews: { slug: string; points: number }[]; leaderboard: { points: number }[] };
    expect(s.crews.find((x) => x.slug === "nightshift")?.points).toBe(77);
    expect(s.leaderboard[0].points).toBe(77);
  });
  it("can't change crew twice in a day", async () => {
    const a = await member("nightshift");
    await a.post("/v1/dig/crew").send({ crew: "sandbath" }).expect(429);
    await a.post("/v1/dig/crew").send({ crew: "not-a-crew" }).expect(400);
  });
});

describe("chambers", () => {
  it("breaks through on the settlement that crosses the target, and never twice", async () => {
    await settle(10, 400);
    await settle(20, 2300);
    await scanTo(99999);
    await dig.settle();
    await dig.settle();
    const rows = await db.digChamber.findMany({ orderBy: { number: "asc" } });
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
    expect(rows[0].brokeAt.getTime()).toBe(roundTime(21));
    const s = await dig.state() as { chamber: { number: number; progressBps: number } };
    expect(s.chamber).toMatchObject({ number: 3, progressBps: 3000 });
  });
  it("gives the chamber to the crew that scored most since the last one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(roundTime(1));
    const a = await member("tunnelrats");
    await a.post("/v1/dig/call").send({ band: "sprinting" }).expect(200);
    vi.restoreAllMocks();
    await settle(72, 1500);
    await scanTo(99999);
    await dig.settle();
    expect((await db.digChamber.findFirstOrThrow()).crew).toBe("tunnelrats");
  });
  it("starts fresh when a new release resets the counters", async () => {
    await settle(20, 2300);
    await scanTo(99999);
    await dig.settle();
    await db.installation.create({ data: { id: "next-release", genesisTimestamp: GENESIS } });
    await db.lastGoodState.update({ where: { key: "status" }, data: { body: { installationId: "next-release" } } });
    const s = await dig.state() as { work: string; chambers: unknown[] };
    expect(s.work).toBe("0");
    expect(s.chambers).toEqual([]);
  });
  it("reports unknown when there's no round clock", async () => {
    await db.lastGoodState.deleteMany();
    await db.installation.deleteMany();
    expect(((await dig.state()) as { status: string }).status).toBe("unavailable");
  });
});

describe("Squeek characters", () => {
  const wallet = "0x8535a46fe5fd088732cf98a63dfbc98d4f038082";
  async function withWallet() {
    const a = await member("nightshift");
    const me = (await a.get("/v1/auth/me")).body.user;
    await db.user.update({ where: { id: me.id }, data: { walletAddress: wallet } });
    return { a, id: me.id };
  }
  const owns = (ids: [string, number][]) => {
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: { tokens: ids.map(([tokenId, level]) => ({ tokenId, level })) } }));
  };
  it("only shows a Squeek the linked wallet really holds", async () => {
    const { a } = await withWallet();
    owns([["322", 1]]);
    await a.post("/v1/dig/squeek").send({ tokenId: "999" }).expect(400);
    const r = await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(200);
    expect(r.body).toEqual({ squeekId: "322", squeekLevel: 1 });
  });
  it("refuses without a linked wallet", async () => {
    const a = await member("nightshift");
    await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(400);
  });
  it("says so when the official API can't confirm ownership", async () => {
    const { a } = await withWallet();
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: { status: "unavailable", reason: "indexer_unavailable" } }));
    await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(503);
  });
  it("gives no extra points", async () => {
    vi.spyOn(Date, "now").mockReturnValue(roundTime(1));
    const { a } = await withWallet();
    owns([["322", 9]]);
    await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(200);
    await a.post("/v1/dig/call").send({ band: "sprinting" }).expect(200);
    vi.restoreAllMocks();
    await settle(72, 1500);
    await scanTo(99999);
    await dig.settle();
    expect((await db.digCall.findFirstOrThrow()).points).toBe(10);
  });
  it("removes a Squeek that's been sold", async () => {
    const { a, id } = await withWallet();
    owns([["322", 1]]);
    await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(200);
    await db.digMember.update({ where: { userId_installationId: { userId: id, installationId: INST } }, data: { squeekCheckedAt: new Date(0) } });
    owns([]);
    await dig.recheckSqueeks();
    expect((await db.digMember.findFirstOrThrow()).squeekId).toBeNull();
  });
  it("keeps a Squeek when the check can't get through", async () => {
    const { a, id } = await withWallet();
    owns([["322", 1]]);
    await a.post("/v1/dig/squeek").send({ tokenId: "322" }).expect(200);
    await db.digMember.update({ where: { userId_installationId: { userId: id, installationId: INST } }, data: { squeekCheckedAt: new Date(0) } });
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => new Error("down"));
    await dig.recheckSqueeks();
    expect((await db.digMember.findFirstOrThrow()).squeekId).toBe("322");
  });
});
