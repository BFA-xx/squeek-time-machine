import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = process.env.API_INTERNAL_URL ?? "http://localhost:4300";

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  transpilePackages: ["@stm/shared"],
  // squeek.koslabs.app is the only address. Zerion, through Blockaid, flagged squeektime.vercel.app
  // as a malicious dapp: a free vercel.app address asking to connect a wallet is the drainer pattern.
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "squeektime.vercel.app" }],
      destination: "https://squeek.koslabs.app/:path*",
      permanent: true,
    }];
  },
  // Everything goes through our own origin, so session cookies stay first-party.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${api}/v1/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
