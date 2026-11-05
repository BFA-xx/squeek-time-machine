import { Prisma } from "@prisma/client";

/** JSON has no bigint or Decimal. Totals go out as decimal strings, the same convention as the official API. */
export function toJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toFixed(0);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}
