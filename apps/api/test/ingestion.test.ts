import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { ChainBackfillService } from "../src/ingestion/chain-backfill.service";
import { IngestionService } from "../src/ingestion/ingestion.service";
import { SqueekApiClient } from "../src/ingestion/squeek-api.client";
import { StreamService, WorldUpdate } from "../src/stream/stream.service";
import { CORE, INST, chainEvent, eventsPage, fakeFetch, makeApp, measuredEvent, wipe } from "./helpers";

let app: INestApplication, db: PrismaService, svc: IngestionService, api: SqueekApiClient, chain: ChainBackfillService, stream: StreamService;

beforeAll(async () => {
  app = await makeApp();
  db = app.get(PrismaService); svc = app.get(IngestionService); api = app.get(SqueekApiClient); chain = app.get(ChainBackfillService); stream = app.get(StreamService);
});
afterAll(() => app.close());
beforeEach(() => wipe(db));

const count = () => db.historicalEvent.count();
const source = (k: string) => db.dataSource.findUnique({ where: { key: `api.${k}` } });

describe("event ingestion", () => {
  it("stores events with their timestamps and source intact", async () => {
    const e = chainEvent(1);
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([e]) }));
    await svc.syncEvents();
    const row = await db.historicalEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.occurredAt.toISOString()).toBe(e.occurredAt);
    expect(row.transactionHash).toBe(e.source.transactionHash);
    expect(row.confirmationStatus).toBe("safe");
    expect(row.provisional).toBe(false);
  });

  it("never stores a repeated event twice, and only announces it once", async () => {
    const seen: WorldUpdate[] = [];
    const sub = stream.updates.subscribe((u) => seen.push(u));
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(1), chainEvent(2)]) }));
    await svc.syncEvents();
    await svc.syncEvents();
    sub.unsubscribe();
    expect(await count()).toBe(2);
    expect(seen.filter((u) => u.kind === "event")).toHaveLength(2);
  });

  it("walks every page of a backfill", async () => {
    api.fetchImpl = fakeFetch((u) => {
      const c = u.searchParams.get("cursor");
      if (!c) return { body: eventsPage([chainEvent(9), chainEvent(8)], "p2") };
      if (c === "p2") return { body: eventsPage([chainEvent(7), chainEvent(6)], "p3") };
      return { body: eventsPage([chainEvent(5)], null) };
    });
    await svc.syncEvents();
    expect(await count()).toBe(5);
    const cursor = await db.ingestionCursor.findUniqueOrThrow({ where: { key: `events.backfill:${INST}` } });
    expect((cursor.meta as { done: boolean }).done).toBe(true);
  });

  it("resumes a backfill from its saved cursor after an interruption", async () => {
    const asked: (string | null)[] = [];
    api.fetchImpl = fakeFetch((u) => {
      const c = u.searchParams.get("cursor");
      asked.push(c);
      if (!c) return { body: eventsPage([chainEvent(9)], "p2") };
      if (c === "p2") return { body: eventsPage([chainEvent(8)], "p3") };
      if (c === "p3") return { body: eventsPage([chainEvent(7)], "p4") };
      return { body: eventsPage([chainEvent(6)], null) };
    });
    await svc.syncEvents(1); // head walks p1 and p2 while they're new; backfill gets one page and stops
    const saved = await db.ingestionCursor.findUniqueOrThrow({ where: { key: `events.backfill:${INST}` } });
    expect(saved.value).not.toBeNull();
    const fresh = app.get(IngestionService);
    await fresh.syncEvents(10);
    expect(await count()).toBe(4);
  });

  it("keeps a measurement provisional and gives it no transaction", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([measuredEvent(5)]) }));
    await svc.syncEvents();
    const row = await db.historicalEvent.findFirstOrThrow();
    expect(row.provisional).toBe(true);
    expect(row.transactionHash).toBeNull();
    expect(row.confirmationStatus).toBe("measured");
  });

  it("turns a wheel milestone into one milestone record that unlocks once", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([measuredEvent(5)]) }));
    await svc.syncEvents();
    await svc.syncEvents();
    const ms = await db.milestone.findMany();
    expect(ms).toHaveLength(1);
    expect(ms[0].title).toBe("5 km lifetime distance");
  });

  it("skips one malformed event and keeps the rest of the page", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(1), { id: "bad", type: "x" }, chainEvent(2)]) }));
    await svc.syncEvents();
    expect(await count()).toBe(2);
    expect((await source("events"))?.reason).toMatch(/1 events failed/);
  });

  it("keeps an event type it has never seen, labelled as unknown", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(1, "system.brand_new", { a: 1 })]) }));
    await svc.syncEvents();
    expect((await db.historicalEvent.findFirstOrThrow()).categorySlug).toBe("other");
  });

  it("records a changed confirmation state as a correction", async () => {
    const e = chainEvent(1);
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([e]) }));
    await svc.syncEvents();
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([{ ...e, source: { ...e.source, confirmationStatus: "finalized" } }]) }));
    await svc.syncEvents();
    const c = await db.recordCorrection.findMany();
    expect(c).toHaveLength(1);
    expect(c[0].oldValue).toBe("safe");
    expect((await db.historicalEvent.findFirstOrThrow()).confirmationStatus).toBe("finalized");
  });
});

describe("outages and schema changes", () => {
  it("treats status unavailable as unknown and writes nothing", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: { schemaVersion: 4, installationId: INST, status: "unavailable", reason: "indexer_unavailable" } }));
    await svc.syncEvents();
    expect(await count()).toBe(0);
    const s = await source("events");
    expect(s?.status).toBe("unavailable");
    expect(s?.reason).toBe("indexer_unavailable");
  });

  it("survives a network failure and recovers without losing or repeating anything", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(1)]) }));
    await svc.syncEvents();
    api.fetchImpl = fakeFetch(() => new Error("ECONNRESET"));
    await svc.syncEvents();
    expect((await source("events"))?.status).toBe("error");
    expect(await count()).toBe(1);
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(2), chainEvent(1)]) }));
    await svc.syncEvents();
    expect((await source("events"))?.status).toBe("ok");
    expect(await count()).toBe(2);
  });

  it("refuses an unsupported schema version rather than guessing", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: { ...eventsPage([chainEvent(1)]), schemaVersion: 99 } }));
    await svc.syncEvents();
    expect(await count()).toBe(0);
    expect((await source("events"))?.status).toBe("schema_mismatch");
  });

  it("keeps the last good status when the next read fails", async () => {
    const status = { schemaVersion: 1, installationId: INST, generatedAt: "2026-11-05T00:00:00.000Z", measurement: { freshness: "online", coreStatus: "RUNNING", rpmMilli: 70000, speedMmPerSecond: 1000, distanceMm: 5 }, builder: { status: "available" } };
    api.fetchImpl = fakeFetch(() => ({ body: status }));
    await svc.syncStatus();
    api.fetchImpl = fakeFetch(() => ({ status: 503, headers: { "retry-after": "5" } }));
    await svc.syncStatus();
    const kept = await db.lastGoodState.findUniqueOrThrow({ where: { key: "status" } });
    expect((kept.body as typeof status).measurement.rpmMilli).toBe(70000);
    expect((await source("status"))?.reason).toBe("http 503");
  });

  it("publishes live wheel data flagged as provisional", async () => {
    const seen: WorldUpdate[] = [];
    const sub = stream.updates.subscribe((u) => seen.push(u));
    api.fetchImpl = fakeFetch(() => ({ body: { schemaVersion: 1, installationId: INST, generatedAt: "2026-11-05T00:00:00.000Z", measurement: { freshness: "online", rpmMilli: 1 }, builder: { status: "available" } } }));
    await svc.syncStatus();
    sub.unsubscribe();
    expect((seen.find((u) => u.kind === "live")?.data as { provisional: boolean }).provisional).toBe(true);
  });
});

describe("settlements and the block vault", () => {
  const settlement = (round: number, first: string | null, last: string | null, count: string, logIndex = 5) => ({
    transactionHash: `0x${round.toString(16).padStart(64, "0")}`, previousSettledThroughRound: String(round - 1), settledThroughRound: String(round), activeRoundCount: "1", workAdded: "10",
    cumulativeWork: "100", cumulativeBlockUnits: "5000000000", firstCompletedBlock: first, lastCompletedBlock: last, completedBlockCount: count, blockHeight: last ?? "0",
    ethereumBlockNumber: "2000", blockTimestamp: "2026-11-05T06:50:36.000Z", logIndex: String(logIndex), confirmationStatus: "safe", sqkMintedBaseUnits: "100",
  });
  const body = (items: unknown[]) => ({ schemaVersion: 3, installationId: INST, status: "available", chain: { safeThroughBlock: "3000", deploymentBlock: "1" }, summary: { settlementCount: "2" }, recentSettlements: items });

  it("creates one block record per completed block, timed by its settlement", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: body([settlement(10, "1", "3", "3")]) }));
    await svc.syncSettlements();
    const blocks = await db.blockRecord.findMany({ orderBy: { height: "asc" } });
    expect(blocks.map((b) => Number(b.height))).toEqual([1, 2, 3]);
    expect(blocks[0].completedAt.toISOString()).toBe("2026-11-05T06:50:36.000Z");
    await svc.syncSettlements();
    expect(await db.blockRecord.count()).toBe(3);
    expect(await db.settlementRecord.count()).toBe(1);
  });

  it("stores a quiet settlement with no blocks", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: body([settlement(11, null, null, "0")]) }));
    await svc.syncSettlements();
    expect(await db.settlementRecord.count()).toBe(1);
    expect(await db.blockRecord.count()).toBe(0);
  });

  it("derives block milestones with the block's real time, and only once", async () => {
    api.fetchImpl = fakeFetch(() => ({ body: body([settlement(10, "1", "12", "12")]) }));
    await svc.syncSettlements();
    await svc.syncSettlements();
    const m = await db.milestone.findUniqueOrThrow({ where: { key: `${INST}:blocks:10` } });
    expect(m.achievedAt.toISOString()).toBe("2026-11-05T06:50:36.000Z");
    expect(await db.milestone.count({ where: { key: `${INST}:blocks:10` } })).toBe(1);
  });

  it("backfills from contract logs, resumes, and doesn't double up with the feed", async () => {
    await db.lastGoodState.create({ data: { key: "core", fetchedAt: new Date(), body: { installationId: INST, identities: { core: CORE }, chain: { deploymentBlock: "100", safeThroughBlock: "200" } } } });
    await db.installation.create({ data: { id: INST, coreAddress: CORE, releaseId: "r" } });
    const tx = `0x${"ab".repeat(32)}`;
    let reads = 0;
    Object.assign(chain, {
      latestBlock: async () => 212n,
      read: async () => {
        reads++;
        return { rounds: [{ roundId: 1n, ethereumBlockNumber: 150n, occurredAt: new Date("2026-11-04T00:00:00Z"), work: 10n, cumulativeWork: 10n, cumulativeBlockUnits: 2_500_000_000n, workPerThousandBlocks: 9500 }],
          settlements: [{ transactionHash: tx, logIndex: 7, ethereumBlockNumber: 150n, occurredAt: new Date("2026-11-04T00:00:00Z"), previousRound: 0n, settledThroughRound: 1n, activeRoundCount: 1, cumulativeWork: 10n, cumulativeBlockUnits: 2_500_000_000n }] };
      },
    });
    (svc as unknown as { coreInfo: null }).coreInfo = null;
    await svc.syncChain();
    expect(reads).toBe(1);
    expect((await db.blockRecord.findMany()).map((b) => Number(b.height)).sort()).toEqual([1, 2]);
    expect((await db.miningRecord.findFirstOrThrow()).workPerThousandBlocks).toBe(9500);
    const eventId = `chain:11155111:${CORE}:${tx}:7:system.settlement_completed`;
    expect(await db.historicalEvent.findUnique({ where: { id: eventId } })).not.toBeNull();
    const cursor = await db.ingestionCursor.findUniqueOrThrow({ where: { key: `chain.backfill:${INST}` } });
    expect(cursor.value).toBe("200");
    // Second run starts past the saved block, so nothing re-reads. Then the official feed reports the same event.
    await svc.syncChain();
    expect(reads).toBe(1);
    api.fetchImpl = fakeFetch(() => ({ body: eventsPage([{ ...chainEvent(1), id: eventId }]) }));
    await svc.syncEvents();
    expect(await db.historicalEvent.count({ where: { type: "system.settlement_completed" } })).toBe(1);
  });
});
