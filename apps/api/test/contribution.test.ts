import { INestApplication } from "@nestjs/common";
import { CONTRACTS } from "@stm/shared";
import request from "supertest";
import { encodeAbiParameters, encodeFunctionData, encodeEventTopics, parseAbi } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/common/prisma.service";
import { ChainBackfillService } from "../src/ingestion/chain-backfill.service";
import { makeApp, wipe } from "./helpers";

const INST = "contrib-test";
const W = "0x8535a46fe5fd088732cf98a63dfbc98d4f038082";
const staking = parseAbi(["function deposit(address collection, uint256[] tokenIds)", "function withdraw(address collection, uint256[] tokenIds)", "function claim(address account) returns (uint256 amount)"]);
const mining = parseAbi(["function checkpoint()", "event Checkpointed(uint64 indexed afterRound, uint64 indexed throughRound, uint64 completedBlocks, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint256 amount, uint256 minted, uint64 lastActivationRound, uint256 totalWeight, uint256 rewardIndex)"]);
const nft = parseAbi(["function merge(uint256 survivor, uint256 donor)", "function setApprovalForAll(address operator, bool approved)"]);
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const checkpointLog = (blocks: bigint) => ({
  address: CONTRACTS.mining,
  topics: encodeEventTopics({ abi: mining, eventName: "Checkpointed", args: { afterRound: 1n, throughRound: 2n } }) as string[],
  data: encodeAbiParameters([{ type: "uint64" }, { type: "uint64" }, { type: "uint96" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint256" }, { type: "uint256" }], [blocks, 1n, 1n, 1n, 1n, 1n, 1n, 1n]),
});

let app: INestApplication, db: PrismaService;
let txs: Record<string, unknown>;
let n = 0;

async function member(wallet: string | null = W, crew = "tunnelrats") {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/v1/auth/register").send({ username: `giver_${++n}`, password: "correct-horse-battery" }).expect(201);
  await agent.post("/v1/dig/crew").send({ crew }).expect(200);
  const id = (await agent.get("/v1/auth/me")).body.user.id;
  if (wallet) await db.user.update({ where: { id }, data: { walletAddress: wallet } });
  return { agent, id };
}
const tx = (to: string, input: string, logs: unknown[] = [], over: Record<string, unknown> = {}) => ({ from: W, to, input, status: "success", blockNumber: 100n, logs, ...over });

beforeAll(async () => {
  app = await makeApp();
  db = app.get(PrismaService);
  Object.assign(app.get(ChainBackfillService), { readTx: async (h: string) => txs[h] ?? null });
});
afterAll(() => app.close());
beforeEach(async () => {
  await wipe(db);
  txs = {};
  await db.installation.create({ data: { id: INST, genesisTimestamp: 1_800_000_000n, releaseId: "core-sepolia-20261103" } });
  await db.lastGoodState.create({ data: { key: "status", fetchedAt: new Date(), body: { installationId: INST } } });
});

describe("crediting real transactions", () => {
  const checkpoint = encodeFunctionData({ abi: mining, functionName: "checkpoint" });
  it("pays for a checkpoint that really issued blocks, and credits the crew", async () => {
    const { agent } = await member();
    txs[hash(1)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)]);
    const r = await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(200);
    expect(r.body).toEqual({ kind: "checkpoint", points: 25 });
    const s = (await agent.get("/v1/dig").expect(200)).body;
    expect(s.crews.find((c: { slug: string }) => c.slug === "tunnelrats").points).toBe(25);
    expect(s.me.contributed).toBe(25);
    expect(s.contributions[0].kind).toBe("checkpoint");
  });
  it("pays less for a checkpoint with no new blocks, and nothing for one with no effect", async () => {
    const { agent } = await member();
    txs[hash(1)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(0n)]);
    expect((await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(200)).body.points).toBe(5);
    txs[hash(2)] = tx(CONTRACTS.mining, checkpoint, []);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(2) }).expect(400);
  });
  it("can't be counted twice", async () => {
    const { agent } = await member();
    txs[hash(1)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)]);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(200);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(409);
  });
  it("refuses someone else's transaction", async () => {
    const { agent } = await member("0x1111111111111111111111111111111111111111");
    txs[hash(1)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)]);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(403);
  });
  it("refuses without a linked wallet, a failed transaction, and other contracts", async () => {
    const noWallet = await member(null);
    await noWallet.agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(400);
    const { agent } = await member();
    txs[hash(2)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)], { status: "reverted" });
    await agent.post("/v1/dig/contributions").send({ txHash: hash(2) }).expect(400);
    txs[hash(3)] = tx("0x2222222222222222222222222222222222222222", checkpoint);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(3) }).expect(400);
    await agent.post("/v1/dig/contributions").send({ txHash: "nope" }).expect(400);
  });
  it("waits for an unmined transaction", async () => {
    const { agent } = await member();
    await agent.post("/v1/dig/contributions").send({ txHash: hash(9) }).expect(503);
  });
  it("gives nothing for withdrawing or approving", async () => {
    const { agent } = await member();
    txs[hash(1)] = tx(CONTRACTS.staking, encodeFunctionData({ abi: staking, functionName: "withdraw", args: [CONTRACTS.nft, [1n]] }));
    await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(400);
    txs[hash(2)] = tx(CONTRACTS.nft, encodeFunctionData({ abi: nft, functionName: "setApprovalForAll", args: [CONTRACTS.staking, true] }));
    await agent.post("/v1/dig/contributions").send({ txHash: hash(2) }).expect(400);
  });
  it("counts each Squeek's deposit once, so moving it back and forth can't farm points", async () => {
    const { agent } = await member();
    const dep = encodeFunctionData({ abi: staking, functionName: "deposit", args: [CONTRACTS.nft, [322n]] });
    txs[hash(1)] = tx(CONTRACTS.staking, dep);
    txs[hash(2)] = tx(CONTRACTS.staking, dep);
    expect((await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(200)).body.points).toBe(10);
    expect((await agent.post("/v1/dig/contributions").send({ txHash: hash(2) }).expect(200)).body.points).toBe(0);
  });
  it("caps everything except checkpoints each day", async () => {
    const { agent } = await member();
    const claim = encodeFunctionData({ abi: staking, functionName: "claim", args: [W] });
    let total = 0;
    for (let i = 1; i <= 10; i++) {
      txs[hash(i)] = tx(CONTRACTS.staking, claim);
      total += (await agent.post("/v1/dig/contributions").send({ txHash: hash(i) }).expect(200)).body.points;
    }
    expect(total).toBe(40);
    txs[hash(50)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)]);
    expect((await agent.post("/v1/dig/contributions").send({ txHash: hash(50) }).expect(200)).body.points).toBe(25);
  });
  it("counts a merge", async () => {
    const { agent } = await member();
    txs[hash(1)] = tx(CONTRACTS.nft, encodeFunctionData({ abi: nft, functionName: "merge", args: [322n, 323n] }));
    expect((await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(200)).body).toEqual({ kind: "merge", points: 15 });
  });
  it("stops when a new release isn't the one this site was built for", async () => {
    const { agent } = await member();
    await db.installation.update({ where: { id: INST }, data: { releaseId: "something-newer" } });
    txs[hash(1)] = tx(CONTRACTS.mining, checkpoint, [checkpointLog(5n)]);
    await agent.post("/v1/dig/contributions").send({ txHash: hash(1) }).expect(503);
  });
});
