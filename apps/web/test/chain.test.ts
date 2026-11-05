import { CONTRACTS } from "@stm/shared";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAIN_ABI } from "@stm/shared";
import { ChainStop, checkRelease, connectWallet, prepare, simulate } from "@/lib/chain";

const ME = "0x8535a46fe5fd088732cf98a63dfbc98d4f038082" as const;
const OTHER = "0x1111111111111111111111111111111111111111";
const mining = parseAbi(CHAIN_ABI.mining);
const staking = parseAbi(CHAIN_ABI.staking);
const nft = parseAbi(CHAIN_ABI.nft);

/** A pretend wallet that answers contract reads from a table, and records anything it's asked to send. */
function wallet(reads: Record<string, unknown>, opts: { callFails?: boolean; chain?: string } = {}) {
  const calls: { method: string; params?: unknown[] }[] = [];
  const abis = [...mining, ...staking, ...nft].filter((x) => x.type === "function") as never[];
  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    calls.push({ method, params });
    if (method === "eth_requestAccounts") return [ME];
    if (method === "eth_chainId") return opts.chain ?? "0xaa36a7";
    if (method === "wallet_switchEthereumChain") return null;
    if (method === "eth_call") {
      const { data } = params![0] as { data: `0x${string}` };
      for (const abi of [mining, staking, nft]) {
        try {
          const d = decodeFunctionData({ abi, data });
          if (d.functionName in reads) return (encodeFunctionResult as unknown as (a: unknown) => string)({ abi, functionName: d.functionName, result: reads[d.functionName] });
          if (opts.callFails) throw new Error("execution reverted");
          return "0x";
        } catch (e) {
          if ((e as Error).message === "execution reverted") throw e;
        }
      }
      if (opts.callFails) throw new Error("execution reverted");
      return "0x";
    }
    throw new Error(`unexpected ${method}`);
  };
  void abis;
  window.ethereum = { request } as never;
  return calls;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { delete (window as { ethereum?: unknown }).ethereum; });

const live = { minted: 0n, processedThroughRound: 0n, startRound: 17n, startHeight: 0n, fundedBlocks: 0n, guardian: OTHER, bootstrapped: true, startCaptured: true, paused: false, active: true };

describe("on-chain actions", () => {
  it("won't start with no wallet", async () => {
    await expect(connectWallet()).rejects.toBeInstanceOf(ChainStop);
  });
  it("moves the wallet to Sepolia when it's on another chain", async () => {
    const calls = wallet({}, { chain: "0x1" });
    await connectWallet();
    expect(calls.some((c) => c.method === "wallet_switchEthereumChain")).toBe(true);
  });
  it("prepares a checkpoint only when a settled round is waiting", async () => {
    wallet({ state: live, checkpointStatus: [false, 275n, true] });
    const p = await prepare({ kind: "checkpoint" }, ME);
    expect(p.to).toBe(CONTRACTS.mining);
    expect(decodeFunctionData({ abi: mining, data: p.data }).functionName).toBe("checkpoint");
    wallet({ state: live, checkpointStatus: [false, 275n, false] });
    await expect(prepare({ kind: "checkpoint" }, ME)).rejects.toThrow(/Nothing is waiting/);
    wallet({ state: { ...live, paused: true }, checkpointStatus: [false, 275n, true] });
    await expect(prepare({ kind: "checkpoint" }, ME)).rejects.toThrow(/paused/);
  });
  it("asks for approval first, then deposits", async () => {
    wallet({ paused: false, ownerOf: ME, isApprovedForAll: false });
    const first = await prepare({ kind: "deposit", tokenIds: ["322"] }, ME);
    expect(first.approval).toBe(true);
    expect(decodeFunctionData({ abi: nft, data: first.data }).functionName).toBe("setApprovalForAll");
    wallet({ paused: false, ownerOf: ME, isApprovedForAll: true });
    const next = await prepare({ kind: "deposit", tokenIds: ["322"] }, ME);
    expect(next.approval).toBe(false);
    expect(next.to).toBe(CONTRACTS.staking);
    expect(decodeFunctionData({ abi: staking, data: next.data }).args?.[1]).toEqual([322n]);
  });
  it("refuses a Squeek the wallet doesn't hold, reading ownership from the chain", async () => {
    wallet({ paused: false, ownerOf: OTHER, isApprovedForAll: true });
    await expect(prepare({ kind: "deposit", tokenIds: ["322"] }, ME)).rejects.toThrow(/doesn't hold Squeek #322/);
  });
  it("refuses a claim with nothing to claim", async () => {
    wallet({ claimable: 0n });
    await expect(prepare({ kind: "claim" }, ME)).rejects.toThrow(/nothing to claim/);
  });
  it("marks a merge irreversible, names both Squeeks and says the donor burns", async () => {
    wallet({ ownerOf: ME });
    const p = await prepare({ kind: "merge", survivor: "322", donor: "323", custody: "wallet" }, ME);
    expect(p.irreversible).toBe(true);
    expect(p.title).toBe("Merge #323 into #322");
    expect(p.effects[0]).toMatch(/#323 is burned permanently/);
    expect(p.to).toBe(CONTRACTS.nft);
    wallet({ depositor: ME });
    const staked = await prepare({ kind: "merge", survivor: "322", donor: "323", custody: "staking" }, ME);
    expect(staked.to).toBe(CONTRACTS.staking);
    expect(decodeFunctionData({ abi: staking, data: staked.data }).functionName).toBe("mergeDeposited");
    await expect(prepare({ kind: "merge", survivor: "322", donor: "322", custody: "wallet" }, ME)).rejects.toThrow(/different/);
  });
  it("sends no value, and a failed simulation stops before any signature", async () => {
    const calls = wallet({ state: live, checkpointStatus: [false, 275n, true] });
    const p = await prepare({ kind: "checkpoint" }, ME);
    await simulate(p, ME);
    expect(calls.some((c) => c.method === "eth_sendTransaction")).toBe(false);
    const bad = wallet({ state: live, checkpointStatus: [false, 275n, true] }, { callFails: true });
    await expect(simulate(p, ME)).rejects.toThrow(/nothing was sent/);
    expect(bad.some((c) => c.method === "eth_sendTransaction")).toBe(false);
  });
  it("stops when a new release isn't the one these addresses came from", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ economy: { release: { id: "core-sepolia-new" } } }), { status: 200 })));
    await expect(checkRelease()).rejects.toThrow(/paused until this site is updated/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ economy: { release: { id: "core-sepolia-20261103" } } }), { status: 200 })));
    await expect(checkRelease()).resolves.toBeUndefined();
  });
});
