import { INestApplication } from "@nestjs/common";
import { privateKeyToAccount } from "viem/accounts";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { IngestionService } from "../src/ingestion/ingestion.service";
import { SqueekApiClient } from "../src/ingestion/squeek-api.client";
import { chainEvent, eventsPage, fakeFetch, makeApp, measuredEvent, wipe } from "./helpers";

let app: INestApplication, db: PrismaService;
const http = () => request(app.getHttpServer());
const ADMIN = "test-admin-token-with-enough-length";
const PASSWORD = "correct-horse-battery";
let n = 0;
const uname = () => `user_${++n}`;

async function signUp(name = uname()) {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/v1/auth/register").send({ username: name, password: PASSWORD }).expect(201);
  return agent;
}

async function seedEvents() {
  const api = app.get(SqueekApiClient);
  api.fetchImpl = fakeFetch(() => ({ body: eventsPage([chainEvent(3), chainEvent(2), measuredEvent(5)]) }));
  await app.get(IngestionService).syncEvents();
  return chainEvent(2).id;
}

beforeAll(async () => {
  app = await makeApp();
  db = app.get(PrismaService);
});
afterAll(() => app.close());
beforeEach(() => wipe(db));

describe("timeline", () => {
  it("lists, filters, searches and pages real records", async () => {
    await seedEvents();
    const all = await http().get("/v1/events").expect(200);
    expect(all.body.events).toHaveLength(3);
    expect(all.body.events[0].occurredAt >= all.body.events[1].occurredAt).toBe(true);
    const milestone = await http().get("/v1/events?category=milestone").expect(200);
    expect(milestone.body.events).toHaveLength(1);
    expect(milestone.body.events[0].provisional).toBe(true);
    expect((await http().get("/v1/events?q=lifetime")).body.events).toHaveLength(1);
    const page1 = await http().get("/v1/events?limit=2").expect(200);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await http().get(`/v1/events?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`).expect(200);
    expect(page2.body.events).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("shows provenance and related events on the detail view", async () => {
    const id = await seedEvents();
    const d = await http().get(`/v1/events/${encodeURIComponent(id)}`).expect(200);
    expect(d.body.transactionHash).toBeTruthy();
    expect(d.body.sourceRef).toContain("etherscan");
    expect(d.body.related.after.id).toBe(chainEvent(3).id);
    expect(d.body.searchText).toBeUndefined();
  });

  it("answers 404 for an event that doesn't exist", () => http().get("/v1/events/nope").expect(404));

  it("reports unknown instead of zero when nothing has been ingested", async () => {
    const s = await http().get("/v1/world/state").expect(200);
    expect(s.body.live).toBeNull();
    expect(s.body.core).toBeNull();
  });
});

describe("accounts", () => {
  it("registers, signs in, and keeps the password out of every response", async () => {
    const name = uname();
    const res = await http().post("/v1/auth/register").send({ username: name, password: PASSWORD }).expect(201);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    await http().post("/v1/auth/login").send({ username: name, password: "wrong-password-xx" }).expect(401);
    const agent = request.agent(app.getHttpServer());
    await agent.post("/v1/auth/login").send({ username: name, password: PASSWORD }).expect(200);
    expect((await agent.get("/v1/auth/me")).body.user.username).toBe(name);
    await agent.post("/v1/auth/logout").expect(200);
    expect((await agent.get("/v1/auth/me")).body.user).toBeNull();
  });

  it("refuses reserved names, duplicates and weak passwords", async () => {
    await http().post("/v1/auth/register").send({ username: "Squeektoshi", password: PASSWORD }).expect(400);
    await http().post("/v1/auth/register").send({ username: "good_name", password: "short" }).expect(400);
    await http().post("/v1/auth/register").send({ username: "dupe_name", password: PASSWORD }).expect(201);
    await http().post("/v1/auth/register").send({ username: "DUPE_name", password: PASSWORD }).expect(409);
  });

  it("signs in with a wallet signature, and a nonce only works once", async () => {
    const wallet = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const c = await http().post("/v1/auth/wallet/challenge").send({ address: wallet.address }).expect(200);
    expect(c.body.message).toContain("isn't a transaction");
    const signature = await wallet.signMessage({ message: c.body.message });
    const r = await http().post("/v1/auth/wallet/verify").send({ nonce: c.body.nonce, signature }).expect(200);
    expect(r.body.user.wallet).toBe(wallet.address);
    await http().post("/v1/auth/wallet/verify").send({ nonce: c.body.nonce, signature }).expect(401);
  });

  it("refuses a signature from a different wallet", async () => {
    const a = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const b = privateKeyToAccount(`0x${"33".repeat(32)}`);
    const c = await http().post("/v1/auth/wallet/challenge").send({ address: a.address }).expect(200);
    await http().post("/v1/auth/wallet/verify").send({ nonce: c.body.nonce, signature: await b.signMessage({ message: c.body.message }) }).expect(401);
  });

  it("refuses writes from another site", async () => {
    await http().post("/v1/auth/register").set("Origin", "https://evil.example").send({ username: uname(), password: PASSWORD }).expect(403);
  });
});

describe("community", () => {
  it("needs an account to post, not to read", async () => {
    const id = await seedEvents();
    await http().get(`/v1/community/comments?subject=${encodeURIComponent(`event:${id}`)}`).expect(200);
    await http().post("/v1/community/comments").send({ subject: `event:${id}`, body: "hi" }).expect(401);
  });

  it("attaches an I WAS HERE memory to an event and shows it", async () => {
    const id = await seedEvents();
    const agent = await signUp();
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "I was here when this settled." }).expect(201);
    const list = await http().get(`/v1/community/memories?subject=${encodeURIComponent(`event:${id}`)}`).expect(200);
    expect(list.body[0].body).toBe("I was here when this settled.");
    expect((await http().get("/v1/community/feed")).body[0].kind).toBe("memory");
    expect((await http().get("/v1/community/discovery")).body.mostRemembered[0].id).toBe(id);
  });

  it("can't touch the official record", async () => {
    const id = await seedEvents();
    const before = await db.historicalEvent.findUniqueOrThrow({ where: { id } });
    const agent = await signUp();
    await agent.post("/v1/community/comments").send({ subject: `event:${id}`, body: "actually this happened yesterday", title: "HACKED", occurredAt: "2000-01-01" }).expect(201);
    const after = await db.historicalEvent.findUniqueOrThrow({ where: { id } });
    expect(after).toEqual(before);
    await agent.post("/v1/events").send({ id: "fake" }).expect(404);
    await agent.put(`/v1/events/${encodeURIComponent(id)}`).send({ title: "x" }).expect(404);
  });

  it("refuses subjects that don't exist", async () => {
    const agent = await signUp();
    await agent.post("/v1/community/comments").send({ subject: "event:nope", body: "hi" }).expect(404);
    await agent.post("/v1/community/comments").send({ subject: "admin:1", body: "hi" }).expect(400);
  });

  it("refuses links and scams, stores markup as inert text", async () => {
    const id = await seedEvents();
    const agent = await signUp();
    await agent.post("/v1/community/comments").send({ subject: `event:${id}`, body: "claim at https://fake-squeek.xyz" }).expect(400);
    await agent.post("/v1/community/comments").send({ subject: `event:${id}`, body: "share your seed phrase" }).expect(400);
    const ok = await agent.post("/v1/community/comments").send({ subject: `event:${id}`, body: "<img src=x onerror=alert(1)>" }).expect(201);
    expect(ok.body.body).toBe("<img src=x onerror=alert(1)>");
  });

  it("refuses injection attempts in query strings", async () => {
    await seedEvents();
    const r = await http().get(`/v1/events?q=${encodeURIComponent("'; DROP TABLE \"HistoricalEvent\"; --")}`).expect(200);
    expect(r.body.events).toEqual([]);
    expect(await db.historicalEvent.count()).toBe(3);
  });

  it("rate limits one account and refuses duplicates", async () => {
    const id = await seedEvents();
    const agent = await signUp();
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "first" }).expect(201);
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "first" }).expect(409);
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "second" }).expect(201);
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "third" }).expect(201);
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "fourth" }).expect(429);
  });

  it("toggles reactions", async () => {
    const id = await seedEvents();
    const agent = await signUp();
    const on = await agent.post("/v1/community/reactions").send({ subject: `event:${id}`, kind: "squeek" }).expect(200);
    expect(on.body).toMatchObject({ active: true, count: 1 });
    const off = await agent.post("/v1/community/reactions").send({ subject: `event:${id}`, kind: "squeek" }).expect(200);
    expect(off.body).toMatchObject({ active: false, count: 0 });
    await agent.post("/v1/community/reactions").send({ subject: `event:${id}`, kind: "rocket" }).expect(400);
  });

  it("runs polls with one vote per person", async () => {
    const agent = await signUp();
    const p = await agent.post("/v1/community/polls").send({ question: "When does he run most?", options: ["Night", "Day"], scope: "future" }).expect(201);
    await agent.post(`/v1/community/polls/${p.body.id}/vote`).send({ optionId: p.body.options[0].id }).expect(200);
    await agent.post(`/v1/community/polls/${p.body.id}/vote`).send({ optionId: p.body.options[1].id }).expect(409);
    await agent.post(`/v1/community/polls/${p.body.id}/vote`).send({ optionId: "fake" }).expect(400);
    const list = await agent.get("/v1/community/polls?scope=future").expect(200);
    expect(list.body[0].options[0].votes).toBe(1);
    expect(list.body[0].myVote).toBe(p.body.options[0].id);
    await agent.post("/v1/community/polls").send({ question: "one option?", options: ["only"] }).expect(400);
  });

  it("hides a post after three reports, and a moderator can restore it", async () => {
    const id = await seedEvents();
    const author = await signUp();
    const m = await author.post("/v1/community/memories").send({ subject: `event:${id}`, body: "reported post" }).expect(201);
    for (let i = 0; i < 3; i++) {
      const r = await signUp();
      await r.post("/v1/community/reports").send({ subject: `memory:${m.body.id}`, reason: "spam" }).expect(200);
    }
    expect((await http().get(`/v1/community/memories?subject=${encodeURIComponent(`event:${id}`)}`)).body).toEqual([]);
    expect((await http().get("/v1/community/feed")).body.find((f: { kind: string }) => f.kind === "memory")).toBeUndefined();
    await http().get("/v1/admin/reports").expect(401);
    await http().get("/v1/admin/reports").set("x-admin-token", "wrong").expect(401);
    const open = await http().get("/v1/admin/reports").set("x-admin-token", ADMIN).expect(200);
    expect(open.body).toHaveLength(3);
    await http().post(`/v1/admin/reports/${open.body[0].id}/resolve`).set("x-admin-token", ADMIN).send({ action: "restore" }).expect(200);
    expect((await http().get(`/v1/community/memories?subject=${encodeURIComponent(`event:${id}`)}`)).body).toHaveLength(1);
    expect((await http().get("/v1/admin/reports").set("x-admin-token", ADMIN)).body).toHaveLength(0);
  });

  it("can't report official records", async () => {
    const id = await seedEvents();
    const agent = await signUp();
    await agent.post("/v1/community/reports").send({ subject: `event:${id}`, reason: "wrong" }).expect(400);
  });

  it("a ban ends the session and hides the profile", async () => {
    const id = await seedEvents();
    const name = uname();
    const author = await signUp(name);
    const m = await author.post("/v1/community/memories").send({ subject: `event:${id}`, body: "bad post" }).expect(201);
    const reporter = await signUp();
    await reporter.post("/v1/community/reports").send({ subject: `memory:${m.body.id}`, reason: "abuse" }).expect(200);
    const [report] = (await http().get("/v1/admin/reports").set("x-admin-token", ADMIN)).body;
    await http().post(`/v1/admin/reports/${report.id}/resolve`).set("x-admin-token", ADMIN).send({ action: "ban" }).expect(200);
    await author.post("/v1/community/memories").send({ subject: `event:${id}`, body: "again" }).expect(401);
    await http().get(`/v1/users/${name}`).expect(404);
  });

  it("shows a profile with contribution history", async () => {
    const id = await seedEvents();
    const name = uname();
    const agent = await signUp(name);
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "hello" }).expect(201);
    await agent.put("/v1/users/me/profile").send({ bio: "wheel watcher" }).expect(200);
    const p = await http().get(`/v1/users/${name}`).expect(200);
    expect(p.body.bio).toBe("wheel watcher");
    expect(p.body.contributions).toHaveLength(1);
    expect(JSON.stringify(p.body)).not.toContain("passwordHash");
  });

  it("lets members set a name, about text and username, and shows them everywhere", async () => {
    const id = await seedEvents();
    const name = uname();
    const agent = await signUp(name);
    const r = await agent.put("/v1/users/me/profile").send({ displayName: "Wheel Watcher", bio: "hi" }).expect(200);
    expect(r.body.user.displayName).toBe("Wheel Watcher");
    expect((await agent.get("/v1/auth/me")).body.user.displayName).toBe("Wheel Watcher");
    await agent.post("/v1/community/memories").send({ subject: `event:${id}`, body: "named post" }).expect(201);
    expect((await http().get("/v1/community/memories")).body[0].displayName).toBe("Wheel Watcher");
    const next = uname();
    const renamed = await agent.put("/v1/users/me/profile").send({ username: next }).expect(200);
    expect(renamed.body.user.username).toBe(next);
    await http().get(`/v1/users/${next}`).expect(200);
    await http().get(`/v1/users/${name}`).expect(404);
    expect((await http().get("/v1/community/memories")).body[0].username).toBe(next);
    await agent.put("/v1/users/me/profile").send({ displayName: "" }).expect(200);
    expect((await agent.get("/v1/auth/me")).body.user.displayName).toBeNull();
  });

  it("limits username changes and refuses taken, reserved and impersonating names", async () => {
    const agent = await signUp();
    const other = uname();
    await signUp(other);
    await agent.put("/v1/users/me/profile").send({ username: other.toUpperCase() }).expect(409);
    await agent.put("/v1/users/me/profile").send({ username: "Squeektoshi" }).expect(400);
    await agent.put("/v1/users/me/profile").send({ username: "has space" }).expect(400);
    await agent.put("/v1/users/me/profile").send({ displayName: "Squeek Toshi!" }).expect(400);
    await agent.put("/v1/users/me/profile").send({ displayName: "visit evil-site.top" }).expect(400);
    await agent.put("/v1/users/me/profile").send({ username: uname() }).expect(200);
    await agent.put("/v1/users/me/profile").send({ username: uname() }).expect(429);
  });

  it("counts shares", async () => {
    const id = await seedEvents();
    expect((await http().post("/v1/community/share").send({ subject: `event:${id}` }).expect(200)).body.count).toBe(1);
    await http().post("/v1/community/share").send({ subject: "nope" }).expect(400);
  });
});
