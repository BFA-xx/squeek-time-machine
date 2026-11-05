import { z } from "zod";

/**
 * Validators for the official API. They check only the fields this app reads, and
 * ignore the rest: the docs say new fields can appear without a version change.
 * Numbers stay decimal strings, because cumulative totals overflow a JS number.
 */
const dec = z.string().regex(/^\d+$/);
const iso = z.string().min(10);

export const Unavailable = z.object({ status: z.literal("unavailable"), reason: z.string() }).passthrough();

const ChainSource = z.object({
  kind: z.literal("chain"),
  chainId: dec,
  target: z.string(),
  releaseId: z.string(),
  contractAddress: z.string(),
  blockNumber: dec,
  blockHash: z.string().optional(),
  transactionHash: z.string(),
  transactionIndex: dec.optional(),
  logIndex: dec,
  confirmationStatus: z.string(),
});

const MeasurementSource = z.object({
  kind: z.literal("measurement"),
  installationId: z.string(),
  receiptCursor: dec.optional(),
  telemetryId: z.string().optional(),
  observedAt: iso,
  receivedAt: iso,
  policyVersion: z.string().optional(),
  disposition: z.string().optional(),
});

export const ApiEvent = z.object({
  id: z.string().min(1).max(512),
  eventVersion: z.number().int(),
  type: z.string().min(1).max(100),
  occurredAt: iso,
  recordedAt: iso,
  source: z.discriminatedUnion("kind", [ChainSource, MeasurementSource]),
  payload: z.record(z.unknown()),
});
export type ApiEvent = z.infer<typeof ApiEvent>;

export const EventsResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  status: z.literal("available"),
  nextCursor: z.string().nullable(),
  events: z.array(z.unknown()),
}).passthrough();

const Totals = z.object({
  cumulativeWork: dec,
  cumulativeBlockUnits: dec,
  blockHeight: dec,
  blockProgress: dec,
  workPerThousandBlocks: dec,
}).passthrough();

export const StatusResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  generatedAt: iso,
  measurement: z.object({
    freshness: z.string(),
    observedAt: iso.nullable().optional(),
    staleAfterSeconds: z.number().optional(),
    counterEpoch: z.string().nullable().optional(),
    cumulativeWorkUnits: dec.nullable().optional(),
    provenance: z.string().nullable().optional(),
    coreStatus: z.string().nullable().optional(),
    rpmMilli: z.number().nullable().optional(),
    speedMmPerSecond: z.number().nullable().optional(),
    distanceMm: z.number().nullable().optional(),
  }).passthrough(),
  builder: z.object({
    status: z.string(),
    anchor: Totals.extend({ settledThroughRound: dec, confirmedAt: iso.nullable().optional(), transactionHash: z.string().nullable().optional() }).optional(),
    projected: Totals.extend({ lifecycle: z.string().optional() }).optional(),
  }).passthrough(),
}).passthrough();
export type StatusResponse = z.infer<typeof StatusResponse>;

export const CoreResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  status: z.literal("available"),
  chain: z.object({ chainId: dec, deploymentBlock: dec, safeThroughBlock: dec }).passthrough(),
  identities: z.object({ core: z.string() }).passthrough(),
  configuration: z.object({
    genesisTimestamp: dec,
    roundDuration: dec,
    initialWorkPerThousandBlocks: dec,
    targetBlocksPerActiveRound: dec,
    blockUnitsPerBlock: dec,
  }).passthrough(),
  core: Totals.extend({ settledThroughRound: dec, paused: z.boolean() }),
}).passthrough();
export type CoreResponse = z.infer<typeof CoreResponse>;

export const SettlementItem = z.object({
  transactionHash: z.string(),
  previousSettledThroughRound: dec,
  settledThroughRound: dec,
  activeRoundCount: dec,
  workAdded: dec,
  cumulativeWork: dec,
  cumulativeBlockUnits: dec,
  firstCompletedBlock: dec.nullable(),
  lastCompletedBlock: dec.nullable(),
  completedBlockCount: dec,
  blockHeight: dec,
  ethereumBlockNumber: dec,
  blockTimestamp: iso,
  logIndex: dec,
  confirmationStatus: z.string(),
  sqkMintedBaseUnits: dec.nullable().optional(),
});
export type SettlementItem = z.infer<typeof SettlementItem>;

export const SettlementsResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  status: z.literal("available"),
  chain: z.object({ safeThroughBlock: dec, deploymentBlock: dec }).passthrough(),
  summary: z.object({ settlementCount: dec, archivedSettlementCount: dec.optional() }).passthrough(),
  recentSettlements: z.array(SettlementItem),
}).passthrough();

const DayCoverage = z.object({ expectedRoundCount: z.number(), observedRoundCount: z.number(), coverageBps: z.number() }).passthrough();

export const StatsResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  generatedAt: iso,
  lifetime: z.object({ acceptedWorkUnits: dec, observedDistanceMm: dec, activeDayCount: z.number(), settledBlockCount: dec, firstObservedAt: iso.nullable().optional() }).passthrough(),
  activity: z.object({
    days: z.array(z.object({
      date: z.string(),
      coverage: DayCoverage,
      observedWorkUnits: dec.nullable(),
      distanceMm: dec.nullable(),
      buckets: z.array(z.record(z.unknown())).optional(),
    }).passthrough()),
    typicalDay: z.array(z.record(z.unknown())).optional(),
  }).passthrough(),
  records: z.record(z.unknown()),
  rounds: z.record(z.unknown()).optional(),
}).passthrough();
export type StatsResponse = z.infer<typeof StatsResponse>;

export const EconomyResponse = z.object({
  schemaVersion: z.number().int(),
  installationId: z.string(),
  status: z.literal("available"),
  release: z.object({ id: z.string() }).passthrough(),
  chain: z.object({ safeThroughBlock: dec, deploymentBlock: dec }).passthrough(),
  // Schema 2 lists contracts under "identities"; schema 3 moved them to "deployment.components".
  identities: z.object({ core: z.string() }).passthrough().optional(),
  deployment: z.object({ components: z.object({ core: z.object({ address: z.string() }).passthrough() }).passthrough() }).passthrough().optional(),
  supply: z.object({ capBaseUnits: dec, totalMintedBaseUnits: dec, miningMintedBaseUnits: dec, liveSupplyBaseUnits: dec }).passthrough(),
  schedule: z.object({ bonusBlocks: dec, halvingBlocks: dec, firstPeriodRateBaseUnits: dec, launchBonusBaseUnits: dec }).passthrough(),
  staking: z.object({ totalStakedBaseUnits: dec }).passthrough().nullable(),
  nft: z.object({ issued: dec, burned: dec, live: dec, mergesOpen: z.boolean() }).passthrough(),
}).passthrough();
export type EconomyResponse = z.infer<typeof EconomyResponse>;

/** Versions this app has been read against. A new one stops ingestion for that source and is reported, never guessed at. */
export const SUPPORTED_SCHEMA_VERSIONS: Record<string, number[]> = {
  events: [3, 4],
  status: [1],
  core: [1],
  settlements: [3],
  stats: [1],
  economy: [2, 3],
};
