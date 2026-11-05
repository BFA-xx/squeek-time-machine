import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/common/prisma.service";

const TABLES = ["DigCall", "DigMember", "DigShift", "DigChamber", "ModerationReport", "UserContribution", "ShareRecord", "PollVote", "PollOption", "Poll", "Reaction", "Comment", "CommunityMemory", "WalletChallenge", "Session", "UserProfile", "User", "Milestone", "WheelDay", "MiningRecord", "BlockRecord", "SettlementRecord", "RecordCorrection", "HistoricalEvent", "LastGoodState", "IngestionCursor", "DataSource", "Installation"];

export async function makeApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export async function wipe(db: PrismaService) {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(",")} CASCADE`);
}

export const INST = "sepolia-core-test";
export const CORE = "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4";

export function chainEvent(i: number, type = "system.settlement_completed", payload: Record<string, unknown> = {}) {
  const tx = `0x${i.toString(16).padStart(64, "0")}`;
  return {
    id: `chain:11155111:${CORE}:${tx}:${i}:${type}`, eventVersion: 2, type,
    occurredAt: new Date(Date.UTC(2026, 10, 4, 0, i)).toISOString(), recordedAt: new Date(Date.UTC(2026, 10, 4, 0, i)).toISOString(),
    source: { kind: "chain", chainId: "11155111", target: "sepolia", releaseId: "r", contractAddress: CORE, blockNumber: String(1000 + i), blockHash: "0xabc", transactionHash: tx, transactionIndex: "1", logIndex: String(i), confirmationStatus: "safe" },
    payload: { previousSettledThroughRound: String(i), settledThroughRound: String(i + 1), activeRoundCount: "1", workAdded: "10", completedBlockCount: "1", firstCompletedBlock: String(i + 1), lastCompletedBlock: String(i + 1), ...payload },
  };
}

export function measuredEvent(km: number) {
  const at = new Date(Date.UTC(2026, 10, 4, 12, km)).toISOString();
  return {
    id: `measurement:${INST}:hamster-lifetime-distance-2:measurement.distance_milestone:${km * 1_000_000}`, eventVersion: 1, type: "measurement.distance_milestone", occurredAt: at, recordedAt: at,
    source: { kind: "measurement", installationId: INST, receiptCursor: "1", telemetryId: "t", observedAt: at, receivedAt: at, policyVersion: "p", disposition: "accepted" },
    payload: { thresholdDistanceMm: String(km * 1_000_000), observedLifetimeDistanceMm: String(km * 1_000_000 + 5000) },
  };
}

type Route = (url: URL) => { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A stand-in for the official API, so tests can script outages, schema changes and pagination. */
export function fakeFetch(route: Route): typeof fetch {
  return (async (input: string | URL | Request) => {
    const r = route(new URL(String(input)));
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
}
export const eventsPage = (events: unknown[], nextCursor: string | null = null, extra: Record<string, unknown> = {}) => ({ schemaVersion: 4, installationId: INST, status: "available", nextCursor, events, ...extra });
