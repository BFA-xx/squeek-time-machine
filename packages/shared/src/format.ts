const SQK = 10n ** 18n;

/** SQK with thousands separators, from base units. Integer maths only. */
export function formatSqk(baseUnits: string | bigint, decimals = 2): string {
  const v = typeof baseUnits === "bigint" ? baseUnits : BigInt(baseUnits);
  const whole = v / SQK;
  const scale = 10n ** BigInt(decimals);
  const frac = ((v % SQK) * scale) / SQK;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals === 0 ? w : `${w}.${frac.toString().padStart(decimals, "0")}`;
}

export function formatInt(v: string | number | bigint): string {
  return BigInt(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function mmToKm(mm: string | number | bigint, decimals = 2): string {
  return (Number(mm) / 1_000_000).toFixed(decimals);
}

export function mmPerSecToKmh(mmPerSecond: number, decimals = 1): string {
  return ((mmPerSecond * 3.6) / 1000).toFixed(decimals);
}

export function rpmFromMilli(rpmMilli: number, decimals = 1): string {
  return (rpmMilli / 1000).toFixed(decimals);
}

export function shortHash(hash: string, head = 8, tail = 6): string {
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function etherscanTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

/** Whole blocks and the fraction towards the next, from cumulative block units. */
export function blockProgressPercent(blockProgress: string): number {
  return Number((BigInt(blockProgress) * 10000n) / 1_000_000_000n) / 100;
}

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
