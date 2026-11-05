import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqueekApiClient } from "../src/ingestion/squeek-api.client";
import { SqueeksService } from "../src/squeeks/squeeks.service";
import { fakeFetch, makeApp } from "./helpers";

const W = "0x8535a46fe5fd088732cf98a63dfbc98d4f038082";
const token = (id: string, custody = "wallet") => ({ tokenId: id, custody, level: 1, basePower: "1000", nextMergeHeight: "0", mergeState: "ready" });
let app: INestApplication;
const http = () => request(app.getHttpServer());
const fresh = () => {
  const s = app.get(SqueeksService) as unknown as { accounts: Map<string, unknown>; squeeks: Map<string, unknown> };
  s.accounts.clear();
  s.squeeks.clear();
};

beforeAll(async () => { app = await makeApp(); });
afterAll(() => app.close());

describe("viewing a wallet's Squeeks", () => {
  it("lists staked and wallet Squeeks across every page, with no signature", async () => {
    fresh();
    app.get(SqueekApiClient).fetchImpl = fakeFetch((u) => u.searchParams.get("cursor")
      ? { body: { account: W, installationId: "i", nextCursor: null, tokens: [token("2", "staking")] } }
      : { body: { account: W, installationId: "i", nextCursor: "p2", tokens: [token("1")], tokenCounts: { staking: "1", wallet: "1" }, rewards: { claimableBaseUnits: "5" }, power: { nftPower: "1", sqkPower: "0" } } });
    const r = await http().get(`/v1/squeeks/owner/${W}`).expect(200);
    expect(r.body.tokens.map((t: { tokenId: string; custody: string }) => [t.tokenId, t.custody])).toEqual([["1", "wallet"], ["2", "staking"]]);
    expect(r.body.claimableBaseUnits).toBe("5");
  });
  it("refuses something that isn't an address", () => http().get("/v1/squeeks/owner/not-a-wallet").expect(400));
  it("says the API is down instead of claiming the wallet is empty", async () => {
    fresh();
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: { status: "unavailable", reason: "indexer_unavailable" } }));
    await http().get(`/v1/squeeks/owner/${W}`).expect(503);
  });
  it("shows an empty wallet as empty", async () => {
    fresh();
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: { account: W, installationId: "i", nextCursor: null, tokens: [] } }));
    expect((await http().get(`/v1/squeeks/owner/${W}`).expect(200)).body.tokens).toEqual([]);
  });
});

describe("a Squeek's art", () => {
  const squeek = (imageDataUri: string) => ({ tokenId: "322", level: 2, basePower: "2200", nextMergeHeight: "0", mergeState: "ready", custody: { owner: W, burned: false }, metadata: { status: "available", name: "Squeek #322", imageDataUri, attributes: [{ trait_type: "Fur", value: "Gold" }] } });
  it("passes a base64 SVG and its traits", async () => {
    fresh();
    app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: squeek("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=") }));
    const r = await http().get("/v1/squeeks/322").expect(200);
    expect(r.body.image).toContain("base64");
    expect(r.body.attributes).toEqual([{ trait: "Fur", value: "Gold" }]);
  });
  it("drops art that isn't a plain base64 SVG", async () => {
    for (const bad of ["data:text/html;base64,PHNjcmlwdD4=", "javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "https://evil.example/x.svg"]) {
      fresh();
      app.get(SqueekApiClient).fetchImpl = fakeFetch(() => ({ body: squeek(bad) }));
      expect((await http().get("/v1/squeeks/322").expect(200)).body.image).toBeNull();
    }
  });
  it("refuses a bad number", () => http().get("/v1/squeeks/abc").expect(400));
});
