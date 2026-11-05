import { INestApplication } from "@nestjs/common";
import { signTicket, verifyTicket } from "@stm/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { DigService } from "../src/dig/dig.service";
import { makeApp, wipe } from "./helpers";

const INST = "tasks-test";
const SECRET = "t".repeat(40);
let app: INestApplication, db: PrismaService, dig: DigService;
let n = 0;

async function player(crew: string | null = "tunnelrats") {
  const agent = request.agent(app.getHttpServer());
  const name = `task_${++n}`;
  const res = await agent.post("/v1/auth/register").send({ username: name, password: "correct-horse-battery" }).expect(201);
  if (crew) await agent.post("/v1/dig/crew").send({ crew }).expect(200);
  return { agent, name, id: (await db.user.findFirstOrThrow({ where: { username: name } })).id, res };
}
const receipt = (u: string, k: "together" | "hello", exp = Math.floor(Date.now() / 1000) + 600, secret = SECRET) => signTicket({ u, k, exp }, secret);
const taskOf = async (agent: ReturnType<typeof request.agent>, slug: string) => (await agent.get("/v1/dig").expect(200)).body.me.tasks.find((t: { slug: string }) => t.slug === slug);

beforeAll(async () => {
  process.env.REALTIME_SECRET = SECRET;
  process.env.REALTIME_URL = "ws://localhost:4400";
  app = await makeApp();
  db = app.get(PrismaService);
  dig = app.get(DigService);
});
afterAll(async () => {
  delete process.env.REALTIME_SECRET;
  delete process.env.REALTIME_URL;
  await app.close();
});
beforeEach(async () => {
  await wipe(db);
  vi.restoreAllMocks();
  await db.installation.create({ data: { id: INST, genesisTimestamp: BigInt(Math.floor(Date.now() / 1000) - 100_000) } });
  await db.lastGoodState.create({ data: { key: "status", fetchedAt: new Date(), body: { installationId: INST } } });
});

describe("daily tasks", () => {
  it("won't credit a task that hasn't been done", async () => {
    const { agent } = await player();
    for (const slug of ["call", "chain", "memory"]) await agent.post(`/v1/dig/tasks/${slug}`).send({}).expect(400);
    expect(await db.digTask.count()).toBe(0);
  });
  it("credits a real call once a day, and counts it for the player and crew", async () => {
    const { agent } = await player();
    await agent.post("/v1/dig/call").send({ band: "running" }).expect(200);
    expect((await taskOf(agent, "call")).ready).toBe(true);
    await agent.post("/v1/dig/tasks/call").send({}).expect(200);
    await agent.post("/v1/dig/tasks/call").send({}).expect(409);
    const state = (await agent.get("/v1/dig").expect(200)).body;
    expect(state.me.points).toBe(10);
    expect(state.crews.find((c: { slug: string }) => c.slug === "tunnelrats").points).toBe(10);
  });
  it("needs a visible memory written today", async () => {
    const { agent, id } = await player();
    await db.communityMemory.create({ data: { userId: id, subject: "block:1", body: "hidden one", status: "hidden" } });
    await agent.post("/v1/dig/tasks/memory").send({}).expect(400);
    await db.communityMemory.create({ data: { userId: id, subject: "block:1", body: "old one", createdAt: new Date(Date.now() - 3 * 86400_000) } });
    await agent.post("/v1/dig/tasks/memory").send({}).expect(400);
    await db.communityMemory.create({ data: { userId: id, subject: "block:1", body: "today's" } });
    await agent.post("/v1/dig/tasks/memory").send({}).expect(200);
  });
  it("comes back the next UTC day", async () => {
    const { id } = await player();
    await db.digCall.create({ data: { userId: id, installationId: INST, shiftIndex: 999, band: "running", crew: "tunnelrats" } });
    const now = Date.now();
    await dig.claimTask({ id }, "call", undefined, now);
    await expect(dig.claimTask({ id }, "call", undefined, now)).rejects.toThrow(/already/);
    await expect(dig.claimTask({ id }, "call", undefined, now + 86400_000)).rejects.toThrow(/isn't done/);
  });
  it("only takes wheel and hello tasks with a real room receipt for this player", async () => {
    const a = await player();
    const b = await player();
    await a.agent.post("/v1/dig/tasks/together").send({}).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: "made-up.value" }).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: await receipt(b.id, "together") }).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: await receipt(a.id, "hello") }).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: await receipt(a.id, "together", 100) }).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: await receipt(a.id, "together", undefined, "x".repeat(40)) }).expect(400);
    await a.agent.post("/v1/dig/tasks/together").send({ proof: await receipt(a.id, "together") }).expect(200);
  });
  it("needs a crew and an account", async () => {
    const { agent, id } = await player(null);
    await agent.post("/v1/dig/tasks/hello").send({ proof: await receipt(id, "hello") }).expect(400);
    await request(app.getHttpServer()).post("/v1/dig/tasks/hello").send({}).expect(401);
  });
  it("refuses a made-up task", async () => {
    const { agent } = await player();
    await agent.post("/v1/dig/tasks/free-points").send({}).expect(400);
  });
});

describe("the multiplayer pass", () => {
  it("carries the player's real name, crew and confirmed Squeek", async () => {
    const { agent, name, id } = await player("sandbath");
    await agent.put("/v1/users/me/profile").send({ displayName: "Ann" }).expect(200);
    await db.digMember.update({ where: { userId_installationId: { userId: id, installationId: INST } }, data: { squeekId: "322", squeekLevel: 2 } });
    const { body, headers } = await agent.get("/v1/dig/ticket").expect(200);
    expect(headers["cache-control"]).toBe("no-store");
    expect(body.url).toBe("ws://localhost:4400");
    expect(await verifyTicket(body.ticket, SECRET)).toMatchObject({ u: id, n: name, d: "Ann", c: "sandbath", q: "322", l: 2 });
  });
  it("gives a guest the address and no pass", async () => {
    const { body } = await request(app.getHttpServer()).get("/v1/dig/ticket").expect(200);
    expect(body).toEqual({ url: "ws://localhost:4400", ticket: null });
  });
  it("leaves the game single-player when multiplayer isn't set up", async () => {
    const { agent } = await player();
    delete process.env.REALTIME_URL;
    const { body } = await agent.get("/v1/dig/ticket").expect(200);
    process.env.REALTIME_URL = "ws://localhost:4400";
    expect(body).toEqual({ url: null, ticket: null });
  });
});
