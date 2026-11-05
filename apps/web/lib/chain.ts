"use client";
import { CHAIN_ABI, CHAIN_ID, CHAIN_ID_HEX, CONTRACTS, PINNED_RELEASE, formatSqk } from "@stm/shared";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { api, type WorldState } from "./api";

const mining = parseAbi(CHAIN_ABI.mining);
const staking = parseAbi(CHAIN_ABI.staking);
const nft = parseAbi(CHAIN_ABI.nft);

export type Custody = "wallet" | "staking";
export type Action =
  | { kind: "checkpoint" }
  | { kind: "deposit"; tokenIds: string[] }
  | { kind: "withdraw"; tokenIds: string[] }
  | { kind: "claim" }
  | { kind: "claimAndStake" }
  | { kind: "merge"; survivor: string; donor: string; custody: Custody };

export interface Prepared {
  action: Action;
  title: string;
  effects: string[];
  to: Address;
  data: Hex;
  /** True when this is an approval that has to land before the real action can be prepared. */
  approval: boolean;
  irreversible: boolean;
}

export class ChainStop extends Error {}

function provider() {
  if (!window.ethereum) throw new ChainStop("No wallet found in this browser. Open this page in your wallet app's browser, or install a wallet.");
  return window.ethereum as Parameters<typeof custom>[0];
}
const client = () => createPublicClient({ chain: sepolia, transport: custom(provider()) });

/** Stops before any wallet prompt if the live release isn't the one these addresses came from. */
export async function checkRelease() {
  const w = await api<WorldState & { economy: { release?: { id?: string } } | null }>("/world/state");
  const live = w.economy?.release?.id;
  if (live && live !== PINNED_RELEASE) throw new ChainStop("A new Squeekchain release is live. On-chain actions are paused until this site is updated.");
}

export async function connectWallet(): Promise<Address> {
  const eth = provider() as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  if (!account) throw new ChainStop("The wallet didn't share an account.");
  const chain = Number(await eth.request({ method: "eth_chainId" }));
  if (chain !== CHAIN_ID) await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  return account;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Runs the checks Squeekchain's docs list for each action, against the chain itself. API values never go into a transaction. */
export async function prepare(action: Action, account: Address): Promise<Prepared> {
  const c = client();
  const STAKING = CONTRACTS.staking as Address, NFT = CONTRACTS.nft as Address, MINING = CONTRACTS.mining as Address;
  const ownerOf = (id: string) => c.readContract({ address: NFT, abi: nft, functionName: "ownerOf", args: [BigInt(id)] });
  const depositorOf = (id: string) => c.readContract({ address: STAKING, abi: staking, functionName: "depositor", args: [NFT, BigInt(id)] });

  switch (action.kind) {
    case "checkpoint": {
      const state = await c.readContract({ address: MINING, abi: mining, functionName: "state" });
      if (state.paused) throw new ChainStop("Mining is paused right now.");
      if (state.startRound === 0n) throw new ChainStop("Mining hasn't started yet.");
      const [corePaused, nextRound, roundSettled] = await c.readContract({ address: MINING, abi: mining, functionName: "checkpointStatus" });
      if (corePaused) throw new ChainStop("The core contract is paused right now.");
      if (!roundSettled) throw new ChainStop("Nothing is waiting. Someone has already processed the settled rounds.");
      return { action, approval: false, irreversible: false, to: MINING, data: encodeFunctionData({ abi: mining, functionName: "checkpoint" }), title: `Pull the checkpoint for round ${nextRound}`, effects: ["Turns settled rounds into SQK and funds staking for every Squeek holder.", "You pay the gas and receive no SQK yourself. It's a public service to the network.", "If someone gets there first, it may do nothing."] };
    }
    case "deposit": {
      const paused = await c.readContract({ address: STAKING, abi: staking, functionName: "paused" });
      if (paused) throw new ChainStop("Staking isn't taking deposits right now.");
      for (const id of action.tokenIds) if (!same(await ownerOf(id), account)) throw new ChainStop(`Your wallet doesn't hold Squeek #${id}.`);
      const approved = await c.readContract({ address: NFT, abi: nft, functionName: "isApprovedForAll", args: [account, STAKING] });
      if (!approved) return { action, approval: true, irreversible: false, to: NFT, data: encodeFunctionData({ abi: nft, functionName: "setApprovalForAll", args: [STAKING, true] }), title: "First, allow staking to hold your Squeeks", effects: ["Squeekchain's staking contract needs this approval once, and it covers all your Squeeks.", "After it confirms, you'll be asked to sign the deposit itself."] };
      return { action, approval: false, irreversible: false, to: STAKING, data: encodeFunctionData({ abi: staking, functionName: "deposit", args: [NFT, action.tokenIds.map(BigInt)] }), title: `Deposit ${action.tokenIds.map((t) => `#${t}`).join(", ")}`, effects: ["Your Squeek starts earning SQK, and your power rises straight away.", "You can withdraw it later. Rewards you've earned stay with your account."] };
    }
    case "withdraw": {
      for (const id of action.tokenIds) if (!same(await depositorOf(id), account)) throw new ChainStop(`You aren't the depositor of Squeek #${id}.`);
      return { action, approval: false, irreversible: false, to: STAKING, data: encodeFunctionData({ abi: staking, functionName: "withdraw", args: [NFT, action.tokenIds.map(BigInt)] }), title: `Withdraw ${action.tokenIds.map((t) => `#${t}`).join(", ")}`, effects: ["The Squeek returns to your wallet and stops earning.", "Your power falls straight away. Rewards you've earned stay with your account."] };
    }
    case "claim":
    case "claimAndStake": {
      const amount = await c.readContract({ address: STAKING, abi: staking, functionName: "claimable", args: [account] });
      if (amount === 0n) throw new ChainStop("You have nothing to claim yet.");
      return action.kind === "claim"
        ? { action, approval: false, irreversible: false, to: STAKING, data: encodeFunctionData({ abi: staking, functionName: "claim", args: [account] }), title: `Claim ${formatSqk(amount, 2)} SQK`, effects: ["Your claimable SQK goes to your claim recipient, which is your own wallet unless you've set another."] }
        : { action, approval: false, irreversible: false, to: STAKING, data: encodeFunctionData({ abi: staking, functionName: "claimAndStake" }), title: `Claim and stake ${formatSqk(amount, 2)} SQK`, effects: ["Your claimable SQK becomes staked principal, which raises your power.", "It can't be unstaked until the next 10-minute round begins, and leaving staking costs an exit fee."] };
    }
    case "merge": {
      const { survivor, donor, custody } = action;
      if (survivor === donor) throw new ChainStop("Pick two different Squeeks.");
      for (const id of [survivor, donor]) {
        const holder = custody === "wallet" ? await ownerOf(id) : await depositorOf(id);
        if (!same(holder, account)) throw new ChainStop(`You don't control Squeek #${id}.`);
      }
      const effects = [`Squeek #${donor} is burned permanently. This can't be undone.`, `Squeek #${survivor} survives and goes up one level, with more power.`, "The survivor then has to wait out a cooldown before it can merge again."];
      return custody === "wallet"
        ? { action, approval: false, irreversible: true, to: NFT, data: encodeFunctionData({ abi: nft, functionName: "merge", args: [BigInt(survivor), BigInt(donor)] }), title: `Merge #${donor} into #${survivor}`, effects }
        : { action, approval: false, irreversible: true, to: STAKING, data: encodeFunctionData({ abi: staking, functionName: "mergeDeposited", args: [NFT, BigInt(survivor), BigInt(donor)] }), title: `Merge #${donor} into #${survivor}`, effects };
    }
  }
}

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (reverted?.data?.errorName) return `The contract refused it: ${reverted.data.errorName}.`;
    return e.shortMessage || "The contract refused it.";
  }
  return e instanceof Error ? e.message.slice(0, 200) : "That didn't work.";
}

/** The docs' rule: simulate from the owner's address first, and show the result before asking for a signature. */
export async function simulate(p: Prepared, account: Address): Promise<void> {
  try {
    await client().call({ account, to: p.to, data: p.data });
  } catch (e) {
    throw new ChainStop(`The simulation failed, so nothing was sent. ${explain(e)}`);
  }
}

export interface Sent { hash: Hex; status: "success" | "reverted" }

export async function send(p: Prepared, account: Address): Promise<Sent> {
  const wallet = createWalletClient({ account, chain: sepolia, transport: custom(provider()) });
  let hash: Hex;
  try {
    hash = await wallet.sendTransaction({ account, to: p.to, data: p.data, value: 0n, chain: sepolia });
  } catch (e) {
    throw new ChainStop(explain(e));
  }
  // If this wait fails the outcome is unclear, so the caller shows the hash and doesn't offer a resend.
  const receipt = await client().waitForTransactionReceipt({ hash, timeout: 180_000 });
  return { hash, status: receipt.status };
}
