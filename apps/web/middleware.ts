import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the visitor's address to the API so rate limits apply per person, not to the whole site.
 * Both headers are always overwritten here, so nothing a visitor sends can get through.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-stm-client-ip");
  headers.delete("x-stm-proxy-secret");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const secret = process.env.PROXY_SECRET;
  if (ip && secret) {
    headers.set("x-stm-client-ip", ip);
    headers.set("x-stm-proxy-secret", secret);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/v1/:path*" };
