import { ApiEvent } from "./schemas";
import { formatInt, formatSqk, mmPerSecToKmh, mmToKm, shortHash } from "./format";

export const CATEGORIES = [
  { slug: "settlement", label: "Settlements", group: "protocol" },
  { slug: "checkpoint", label: "Checkpoints", group: "protocol" },
  { slug: "milestone", label: "Wheel milestones", group: "measurement" },
  { slug: "record", label: "Wheel records", group: "measurement" },
  { slug: "merge", label: "Squeek merges", group: "players" },
  { slug: "squeek", label: "Squeek activity", group: "players" },
  { slug: "rewards", label: "Rewards and staking", group: "players" },
  { slug: "archive", label: "Archive notes", group: "protocol" },
  { slug: "other", label: "Other", group: "protocol" },
] as const;
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

const CATEGORY_BY_TYPE: Record<string, CategorySlug> = {
  "system.settlement_completed": "settlement",
  "system.mining_checkpointed": "checkpoint",
  "measurement.distance_milestone": "milestone",
  "measurement.daily_distance_milestone": "milestone",
  "measurement.speed_milestone": "milestone",
  "measurement.distance_streak": "milestone",
  "measurement.speed_record": "record",
  "measurement.rpm_record": "record",
  "nft.merged": "merge",
  "nft.deposited": "squeek",
  "nft.withdrawn": "squeek",
  "nft.launch_claimed": "squeek",
  "account.rewards_claimed": "rewards",
  "account.claim_recipient_set": "rewards",
  "account.rewards_staked": "rewards",
  "account.sqk_staked": "rewards",
  "account.sqk_unstaked": "rewards",
};

export interface NormalizedEvent {
  id: string;
  type: string;
  eventVersion: number;
  category: CategorySlug;
  title: string;
  summary: string;
  significance: number;
  occurredAt: Date;
  recordedAt: Date;
  sourceKind: "chain" | "measurement";
  /** Measurement events come from the device and are not certified on Ethereum. */
  provisional: boolean;
  confirmationStatus: string;
  transactionHash: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  logIndex: number | null;
  contractAddress: string | null;
  installationRef: string | null;
  payload: Record<string, unknown>;
  searchText: string;
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const n = (v: unknown) => {
  const t = s(v);
  return /^\d+$/.test(t) ? t : "0";
};
const acct = (v: unknown) => (s(v) ? shortHash(s(v), 6, 4) : "An account");

/** Titles only restate the payload. Nothing here adds a fact the source didn't give. */
function describe(type: string, p: Record<string, unknown>): { title: string; summary: string; significance: number } {
  switch (type) {
    case "system.settlement_completed": {
      const blocks = BigInt(n(p.completedBlockCount));
      const rounds = `${s(p.previousSettledThroughRound)} → ${s(p.settledThroughRound)}`;
      return blocks > 0n
        ? {
            title: `${formatInt(blocks)} Squeek block${blocks === 1n ? "" : "s"} settled`,
            summary: `Round ${rounds} added ${formatInt(n(p.workAdded))} work and completed blocks ${s(p.firstCompletedBlock)}–${s(p.lastCompletedBlock)} on Ethereum.`,
            significance: 3,
          }
        : {
            title: "Quiet settlement",
            summary: `Round ${rounds} settled with no completed blocks. The certified frontier still moved forward.`,
            significance: 1,
          };
    }
    case "system.mining_checkpointed": {
      const amount = n(p.amountBaseUnits);
      return BigInt(amount) > 0n
        ? { title: `${formatSqk(amount, 0)} SQK issued`, summary: `A checkpoint through round ${s(p.throughRound)} issued SQK for ${formatInt(n(p.completedBlockCount))} completed blocks.`, significance: 2 }
        : { title: "Empty checkpoint", summary: `A checkpoint through round ${s(p.throughRound)} issued no SQK because no blocks completed.`, significance: 0 };
    }
    case "measurement.distance_milestone":
      return { title: `${mmToKm(n(p.thresholdDistanceMm), 0)} km lifetime distance`, summary: `Squeektoshi's measured lifetime distance passed ${mmToKm(n(p.thresholdDistanceMm), 0)} km.`, significance: 5 };
    case "measurement.daily_distance_milestone":
      return { title: `${mmToKm(n(p.thresholdDistanceMm), 0)} km in one day`, summary: `The wheel measured ${mmToKm(n(p.observedDayDistanceMm))} km on the day of ${s(p.utcDate)}.`, significance: 4 };
    case "measurement.speed_milestone":
      return { title: `${mmPerSecToKmh(Number(n(p.thresholdSpeedMmPerSecond)), 0)} km/h reached`, summary: `The wheel measured ${mmPerSecToKmh(Number(n(p.observedSpeedMmPerSecond)))} km/h.`, significance: 4 };
    case "measurement.speed_record":
      return { title: `New top speed: ${mmPerSecToKmh(Number(n(p.recordMmPerSecond)))} km/h`, summary: `The previous record was ${mmPerSecToKmh(Number(n(p.previousRecordMmPerSecond)))} km/h.`, significance: 5 };
    case "measurement.rpm_record":
      return { title: "New wheel RPM record", summary: "The wheel measured a new top RPM.", significance: 4 };
    case "measurement.distance_streak":
      return { title: `${s(p.days)}-day running streak`, summary: `At least ${mmToKm(n(p.minimumDailyDistanceMm), 0)} km a day for ${s(p.days)} consecutive days, ending ${s(p.endingUtcDate)}.`, significance: 5 };
    case "nft.merged":
      return { title: `Squeek #${s(p.survivorTokenId)} reached level ${s(p.level)}`, summary: `${acct(p.account)} merged Squeek #${s(p.donorTokenId)} into #${s(p.survivorTokenId)}. The donor was burned.`, significance: 3 };
    case "nft.deposited":
      return { title: `Squeek #${s(p.tokenId)} deposited`, summary: `${acct(p.account)} deposited Squeek #${s(p.tokenId)} into staking.`, significance: 1 };
    case "nft.withdrawn":
      return { title: `Squeek #${s(p.tokenId)} withdrawn`, summary: `${acct(p.account)} withdrew Squeek #${s(p.tokenId)} from staking.`, significance: 1 };
    case "nft.launch_claimed":
      return { title: `Squeek #${s(p.tokenId)} claimed at launch`, summary: `${acct(p.account)} claimed Squeek #${s(p.tokenId)}.`, significance: 2 };
    case "account.rewards_claimed":
      return { title: `${formatSqk(n(p.amountBaseUnits), 0)} SQK claimed`, summary: `${acct(p.account)} claimed rewards to ${acct(p.recipient)}.`, significance: 1 };
    case "account.rewards_staked":
      return { title: `${formatSqk(n(p.amountBaseUnits), 0)} SQK rewards staked`, summary: `${acct(p.account)} staked rewards.`, significance: 1 };
    case "account.sqk_staked":
      return { title: `${formatSqk(n(p.amountBaseUnits), 0)} SQK staked`, summary: `${acct(p.account)} staked SQK.`, significance: 1 };
    case "account.sqk_unstaked":
      return { title: `${formatSqk(n(p.amountBaseUnits), 0)} SQK unstaked`, summary: `${acct(p.account)} unstaked and paid a ${formatSqk(n(p.feeBaseUnits), 2)} SQK exit fee, which is burned.`, significance: 1 };
    case "account.claim_recipient_set":
      return { title: "Claim recipient changed", summary: `${acct(p.account)} set a new claim recipient.`, significance: 0 };
    default:
      return { title: type, summary: "An event type this archive doesn't have a description for yet. The original payload is kept below.", significance: 1 };
  }
}

export function normalizeEvent(e: ApiEvent): NormalizedEvent {
  const { title, summary, significance } = describe(e.type, e.payload);
  const chain = e.source.kind === "chain" ? e.source : null;
  const occurredAt = new Date(e.occurredAt);
  const recordedAt = new Date(e.recordedAt);
  if (Number.isNaN(occurredAt.getTime()) || Number.isNaN(recordedAt.getTime())) {
    throw new Error(`event ${e.id} has an unreadable timestamp`);
  }
  return {
    id: e.id,
    type: e.type,
    eventVersion: e.eventVersion,
    category: CATEGORY_BY_TYPE[e.type] ?? "other",
    title,
    summary,
    significance,
    occurredAt,
    recordedAt,
    sourceKind: e.source.kind,
    provisional: e.source.kind === "measurement",
    confirmationStatus: chain ? chain.confirmationStatus : "measured",
    transactionHash: chain?.transactionHash ?? null,
    blockNumber: chain?.blockNumber ?? null,
    blockHash: chain?.blockHash || null,
    logIndex: chain ? Number(chain.logIndex) : null,
    contractAddress: chain?.contractAddress ?? null,
    installationRef: chain ? chain.releaseId : e.source.kind === "measurement" ? e.source.installationId : null,
    payload: e.payload,
    searchText: `${title} ${summary} ${e.type} ${chain?.transactionHash ?? ""} ${Object.values(e.payload).map(String).join(" ")}`.toLowerCase(),
  };
}

export interface SettlementFacts {
  transactionHash: string;
  firstCompletedBlock: string | null;
  lastCompletedBlock: string | null;
  completedBlockCount: string;
}

/** Every Squeek block a settlement completed. A block's time is its settlement's Ethereum time. */
export function blocksFromSettlement(s: SettlementFacts): bigint[] {
  if (s.firstCompletedBlock === null || s.lastCompletedBlock === null) return [];
  const first = BigInt(s.firstCompletedBlock);
  const last = BigInt(s.lastCompletedBlock);
  if (last < first) throw new Error(`settlement ${s.transactionHash} has an inverted block range`);
  if (last - first + 1n !== BigInt(s.completedBlockCount)) {
    throw new Error(`settlement ${s.transactionHash} block range disagrees with its count`);
  }
  const out: bigint[] = [];
  for (let h = first; h <= last; h++) out.push(h);
  return out;
}
