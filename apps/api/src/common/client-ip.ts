import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";

interface Req {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Every request reaches this API through the web app, so the socket address is the same for
 * everyone. The web app passes the visitor's address with a shared secret. Without the secret
 * the header is ignored, so a visitor can't pick their own rate-limit bucket.
 */
export function clientIp(req: Req, secret = process.env.PROXY_SECRET ?? ""): string {
  const given = String(req.headers["x-stm-proxy-secret"] ?? "");
  const claimed = String(req.headers["x-stm-client-ip"] ?? "");
  if (secret.length >= 32 && claimed && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return claimed;
  return req.ip ?? "unknown";
}

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as unknown as Req);
  }
}
