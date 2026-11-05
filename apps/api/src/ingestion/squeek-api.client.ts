import { Injectable } from "@nestjs/common";
import { SUPPORTED_SCHEMA_VERSIONS, Unavailable } from "@stm/shared";
import { z } from "zod";

export type FetchOutcome<T> =
  | { ok: true; data: T; schemaVersion: string; notModified?: false }
  | { ok: true; notModified: true }
  | { ok: false; kind: "unavailable" | "schema_mismatch" | "error"; reason: string; retryAfterMs?: number };

/** Every read from the official API goes through here: timeout, ETag, status handling and validation. */
@Injectable()
export class SqueekApiClient {
  private readonly base = (process.env.SQUEEK_API_BASE ?? "https://api.squeekchain.com").replace(/\/$/, "");
  private readonly etags = new Map<string, string>();
  fetchImpl: typeof fetch = (...a) => fetch(...a);

  async get<T>(source: string, path: string, schema: z.ZodType<T>, opts: { conditional?: boolean; versionKey?: string } = {}): Promise<FetchOutcome<T>> {
    const url = `${this.base}${path}`;
    const headers: Record<string, string> = { accept: "application/json", "user-agent": "squeek-time-machine/0.1" };
    const prior = opts.conditional ? this.etags.get(url) : undefined;
    if (prior) headers["if-none-match"] = prior;

    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      return { ok: false, kind: "error", reason: `network: ${(e as Error).message}`.slice(0, 200) };
    }
    if (res.status === 304) return { ok: true, notModified: true };
    if (!res.ok) {
      const after = Number(res.headers.get("retry-after"));
      return { ok: false, kind: "error", reason: `http ${res.status}`, retryAfterMs: Number.isFinite(after) && after > 0 ? after * 1000 : undefined };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: "schema_mismatch", reason: "response was not JSON" };
    }
    // HTTP 200 with status "unavailable" means unknown. It must never be stored as zero or empty.
    const un = Unavailable.safeParse(body);
    if (un.success) return { ok: false, kind: "unavailable", reason: un.data.reason };

    const version = String((body as { schemaVersion?: unknown })?.schemaVersion ?? "");
    const allowed = opts.versionKey ? SUPPORTED_SCHEMA_VERSIONS[opts.versionKey] : undefined;
    if (allowed && !allowed.includes(Number(version))) {
      return { ok: false, kind: "schema_mismatch", reason: `unsupported schemaVersion ${version} for ${source}` };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, kind: "schema_mismatch", reason: `${first?.path.join(".")}: ${first?.message}`.slice(0, 200) };
    }
    const etag = res.headers.get("etag");
    if (opts.conditional && etag) this.etags.set(url, etag);
    return { ok: true, data: parsed.data, schemaVersion: version };
  }
}
