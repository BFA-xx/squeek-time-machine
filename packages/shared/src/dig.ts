/**
 * The Great Dig. A free community game with no money in it. Every result comes from settled
 * rounds on Ethereum, and points can't be bought, sold or spent.
 */
export const ROUNDS_PER_SHIFT = 36; // Six hours of 600-second rounds.
export const ROUND_SECONDS = 600;
export const WORK_PER_CHAMBER = 1000n;

export const CREWS = [
  { slug: "nightshift", name: "The Night Shift", color: "#5b7cfa", motto: "He runs when you sleep." },
  { slug: "cheekpouch", name: "Cheek Pouch", color: "#ffc048", motto: "Store everything. Trust the hoard." },
  { slug: "sandbath", name: "Sand Bath", color: "#f08fb0", motto: "Rest is part of the work." },
  { slug: "tunnelrats", name: "Tunnel Rats", color: "#35d07f", motto: "Technically hamsters." },
] as const;
export type CrewSlug = (typeof CREWS)[number]["slug"];

export const BANDS = [
  { slug: "asleep", name: "Asleep", detail: "No work at all", min: 0n, max: 0n },
  { slug: "stirring", name: "Stirring", detail: "1 to 299 work", min: 1n, max: 299n },
  { slug: "running", name: "Running", detail: "300 to 999 work", min: 300n, max: 999n },
  { slug: "sprinting", name: "Sprinting", detail: "1,000 work or more", min: 1000n, max: null },
] as const;
export type BandSlug = (typeof BANDS)[number]["slug"];

export const isBand = (v: unknown): v is BandSlug => BANDS.some((b) => b.slug === v);
export const isCrew = (v: unknown): v is CrewSlug => CREWS.some((c) => c.slug === v);

export function bandOf(work: bigint): BandSlug {
  for (const b of BANDS) if (work >= b.min && (b.max === null || work <= b.max)) return b.slug;
  throw new Error(`no band for ${work}`);
}

/** Round r runs from genesis + (r - 1) * 600 seconds, as the official API counts them. */
export const roundAt = (genesisSeconds: bigint, nowSeconds: number) => {
  const elapsed = BigInt(Math.floor(nowSeconds)) - genesisSeconds;
  return elapsed < 0n ? 0n : elapsed / BigInt(ROUND_SECONDS) + 1n;
};
export const roundStart = (genesisSeconds: bigint, round: bigint) => genesisSeconds + (round - 1n) * BigInt(ROUND_SECONDS);

export interface ShiftWindow { index: number; startRound: bigint; endRound: bigint }
export function shiftWindow(index: number): ShiftWindow {
  const start = BigInt(index) * BigInt(ROUNDS_PER_SHIFT) + 1n;
  return { index, startRound: start, endRound: start + BigInt(ROUNDS_PER_SHIFT) - 1n };
}
export const shiftOfRound = (round: bigint) => (round < 1n ? 0 : Number((round - 1n) / BigInt(ROUNDS_PER_SHIFT)));

/** Being right when most people were wrong pays more. Everyone who's right gets at least 10. */
export function pointsFor(correct: number, total: number): number {
  if (correct <= 0 || total <= 0) return 0;
  return 10 + Math.floor((90 * (total - correct)) / total);
}

export const chamberOf = (work: bigint) => Number(work / WORK_PER_CHAMBER);
export const chamberTarget = (n: number) => BigInt(n) * WORK_PER_CHAMBER;

/** The crew that scored the most since the last breakthrough claims the chamber. A tie or an empty dig claims nothing. */
export function claimant(points: Partial<Record<string, number>>): string | null {
  const sorted = Object.entries(points).filter(([, p]) => (p ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (!sorted.length) return null;
  if (sorted[1] && sorted[1][1] === sorted[0][1]) return null;
  return sorted[0][0];
}
