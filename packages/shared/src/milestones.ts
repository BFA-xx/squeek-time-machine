import { formatInt, formatSqk } from "./format";

export interface DerivedMilestone {
  key: string;
  kind: "blocks" | "supply" | "settlements";
  title: string;
  description: string;
  value: string;
}

const BLOCK_STEPS = [1n, 10n, 50n, 100n, 250n, 500n, 1000n, 2500n, 5000n, 10000n, 25000n, 50000n, 97020n, 100000n, 250000n, 393470n, 500000n, 1000000n];
const SETTLEMENT_STEPS = [1n, 10n, 100n, 500n, 1000n, 5000n, 10000n];
const SQK_STEPS = [1_000_000n, 10_000_000n, 50_000_000n, 100_000_000n, 500_000_000n, 1_000_000_000n];
const WEI = 10n ** 18n;

/** Milestones this archive computes itself from confirmed totals. Keyed so a replay can't create a second copy. */
export function milestonesCrossed(installationId: string, totals: { blockHeight: bigint; settlements: bigint; mintedBaseUnits?: bigint }): DerivedMilestone[] {
  const out: DerivedMilestone[] = [];
  for (const b of BLOCK_STEPS) {
    if (totals.blockHeight >= b) {
      out.push({ key: `${installationId}:blocks:${b}`, kind: "blocks", title: b === 1n ? "The first Squeek block" : `Block ${formatInt(b)}`, description: `The settled block height reached ${formatInt(b)} in this installation.`, value: b.toString() });
    }
  }
  for (const c of SETTLEMENT_STEPS) {
    if (totals.settlements >= c) {
      out.push({ key: `${installationId}:settlements:${c}`, kind: "settlements", title: c === 1n ? "The first settlement" : `${formatInt(c)} settlements`, description: `${formatInt(c)} settlements have reached Ethereum in this installation.`, value: c.toString() });
    }
  }
  if (totals.mintedBaseUnits !== undefined) {
    for (const q of SQK_STEPS) {
      if (totals.mintedBaseUnits >= q * WEI) {
        out.push({ key: `${installationId}:supply:${q}`, kind: "supply", title: `${formatSqk(q * WEI, 0)} SQK issued by mining`, description: `SQK issued by mining passed ${formatSqk(q * WEI, 0)} in this installation. The premine doesn't count.`, value: q.toString() });
      }
    }
  }
  return out;
}

/** The next documented lifetime distance thresholds: 1, 3, 5, 10, 15, 20, 30 … 100 km, then every 50 km. */
export function nextDistanceThresholds(lifetimeMm: bigint, count = 3): number[] {
  const out: number[] = [];
  const base = [1, 3, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (let km = 0; out.length < count && km < 100000; ) {
    km = km < 100 ? base.find((b) => b > km) ?? 150 : km + 50;
    if (BigInt(km) * 1_000_000n > lifetimeMm) out.push(km);
  }
  return out;
}

export function nextBlockStep(height: bigint): bigint | null {
  return BLOCK_STEPS.find((b) => b > height) ?? null;
}
