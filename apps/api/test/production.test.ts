import { describe, expect, it } from "vitest";
import { clientIp } from "../src/common/client-ip";
import { configProblems } from "../src/common/config";

const SECRET = "s".repeat(32);

describe("client address for rate limits", () => {
  const req = (headers: Record<string, string>) => ({ ip: "10.0.0.1", headers });
  it("uses the address the web app vouches for", () => {
    expect(clientIp(req({ "x-stm-client-ip": "1.2.3.4", "x-stm-proxy-secret": SECRET }), SECRET)).toBe("1.2.3.4");
  });
  it("ignores the header without the right secret, so visitors can't choose their bucket", () => {
    expect(clientIp(req({ "x-stm-client-ip": "1.2.3.4" }), SECRET)).toBe("10.0.0.1");
    expect(clientIp(req({ "x-stm-client-ip": "1.2.3.4", "x-stm-proxy-secret": "wrong" }), SECRET)).toBe("10.0.0.1");
  });
  it("ignores the header when no secret is configured", () => {
    expect(clientIp(req({ "x-stm-client-ip": "1.2.3.4", "x-stm-proxy-secret": "" }), "")).toBe("10.0.0.1");
  });
});

describe("production settings", () => {
  const good = { NODE_ENV: "production", DATABASE_URL: "x", WEB_ORIGINS: "https://a.example", WALLET_DOMAIN: "a.example", ADMIN_TOKEN: SECRET, PROXY_SECRET: SECRET } as NodeJS.ProcessEnv;
  it("accepts a complete configuration", () => expect(configProblems(good)).toEqual([]));
  it("doesn't apply outside production", () => expect(configProblems({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toEqual([]));
  it("names each missing or weak setting", () => {
    expect(configProblems({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toHaveLength(5);
    expect(configProblems({ ...good, ADMIN_TOKEN: "short" }).join()).toMatch(/ADMIN_TOKEN/);
    expect(configProblems({ ...good, WEB_ORIGINS: "http://a.example" }).join()).toMatch(/https/);
  });
});
