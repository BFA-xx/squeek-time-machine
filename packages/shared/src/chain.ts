/**
 * The Sepolia contracts this app will send a wallet to, copied from Squeekchain's published
 * deployment record. A new release means updating this file on purpose, and until then
 * on-chain actions stop rather than guess at new addresses.
 */
export const CHAIN_ID = 11155111;
export const CHAIN_ID_HEX = "0xaa36a7";
export const PINNED_RELEASE = "core-sepolia-20261103";
export const CONTRACTS = {
  core: "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
  nft: "0xc4c7982657f00509548f3a3a41db7fa439a6856b",
  token: "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e",
  mining: "0x2dccb11fcc2defdd188555e45acb52231e82e218",
  staking: "0x50fd1780526c3186a0c037c7622203bc4fb611ca",
} as const;

export const CHAIN_ABI = {
  mining: [
    "function checkpoint()",
    "function checkpointStatus() view returns (bool corePaused, uint64 nextRound, bool roundSettled)",
    "function state() view returns ((uint256 minted, uint64 processedThroughRound, uint64 startRound, uint64 startHeight, uint64 fundedBlocks, address guardian, bool bootstrapped, bool startCaptured, bool paused, bool active))",
    "event Checkpointed(uint64 indexed afterRound, uint64 indexed throughRound, uint64 completedBlocks, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint256 amount, uint256 minted, uint64 lastActivationRound, uint256 totalWeight, uint256 rewardIndex)",
  ],
  staking: [
    "function deposit(address collection, uint256[] tokenIds)",
    "function withdraw(address collection, uint256[] tokenIds)",
    "function claim(address account) returns (uint256 amount)",
    "function claimAndStake() returns (uint256 amount)",
    "function mergeDeposited(address collection, uint256 survivor, uint256 donor)",
    "function claimable(address account) view returns (uint256)",
    "function paused() view returns (bool)",
    "function depositor(address collection, uint256 tokenId) view returns (address)",
  ],
  nft: [
    "function merge(uint256 survivor, uint256 donor)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
  ],
} as const;

export type ContributionKind = "checkpoint" | "deposit" | "claim" | "claimAndStake" | "merge";

/** Rewards doing something useful on-chain. Withdrawing earns nothing, so moving a Squeek back and forth can't farm points. */
export const CONTRIBUTION_POINTS: Record<ContributionKind, number> = { checkpoint: 25, deposit: 10, claim: 5, claimAndStake: 8, merge: 15 };
/** A checkpoint that finished no blocks still moves the rounds along, for a smaller thank-you. */
export const QUIET_CHECKPOINT_POINTS = 5;
/** Daily cap on everything except checkpoints, which are naturally scarce. */
export const DAILY_CONTRIBUTION_CAP = 40;
