import { Injectable, Logger } from "@nestjs/common";
import { createPublicClient, fallback, http, parseAbiItem, type Address } from "viem";
import { sepolia } from "viem/chains";

const batchSettled = parseAbiItem(
  "event BatchSettled(bytes32 indexed digest, address indexed reporter, uint64 indexed settledThroughRound, uint256 nonce, uint64 previousSettledThroughRound, uint16 activeRoundCount, uint64 cumulativeWork, uint96 cumulativeBlockUnits)",
);

const roundRecorded = parseAbiItem(
  "event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)",
);

export interface ChainRound {
  roundId: bigint;
  ethereumBlockNumber: bigint;
  occurredAt: Date;
  work: bigint;
  cumulativeWork: bigint;
  cumulativeBlockUnits: bigint;
  workPerThousandBlocks: number;
}

export interface ChainSettlement {
  transactionHash: string;
  logIndex: number;
  ethereumBlockNumber: bigint;
  occurredAt: Date;
  previousRound: bigint;
  settledThroughRound: bigint;
  activeRoundCount: number;
  cumulativeWork: bigint;
  cumulativeBlockUnits: bigint;
}

/**
 * The API's settlement list only holds the most recent ten, so older history comes from
 * the contract's own logs. Read-only: this class has no signer and no key.
 */
@Injectable()
export class ChainBackfillService {
  private readonly log = new Logger(ChainBackfillService.name);
  private readonly client = createPublicClient({
    chain: sepolia,
    // Public endpoints differ in how much log history they keep, so several are tried in order.
    transport: fallback(
      (process.env.SEPOLIA_RPC_URLS ?? "https://sepolia.gateway.tenderly.co,https://rpc.sepolia.ethpandaops.io,https://ethereum-sepolia-rpc.publicnode.com")
        .split(",")
        .map((u) => http(u.trim(), { timeout: 20_000, retryCount: 0 })),
    ),
  });

  async latestBlock(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async read(core: Address, fromBlock: bigint, toBlock: bigint): Promise<{ settlements: ChainSettlement[]; rounds: ChainRound[] }> {
    const [settled, recorded] = await Promise.all([
      this.client.getLogs({ address: core, event: batchSettled, fromBlock, toBlock, strict: true }),
      this.client.getLogs({ address: core, event: roundRecorded, fromBlock, toBlock, strict: true }),
    ]);
    const times = new Map<bigint, Date>();
    const timeOf = async (n: bigint) => {
      if (!times.has(n)) {
        const b = await this.client.getBlock({ blockNumber: n });
        times.set(n, new Date(Number(b.timestamp) * 1000));
      }
      return times.get(n)!;
    };
    const settlements: ChainSettlement[] = [];
    for (const l of settled) {
      settlements.push({
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
        ethereumBlockNumber: l.blockNumber,
        occurredAt: await timeOf(l.blockNumber),
        previousRound: l.args.previousSettledThroughRound,
        settledThroughRound: l.args.settledThroughRound,
        activeRoundCount: Number(l.args.activeRoundCount),
        cumulativeWork: l.args.cumulativeWork,
        cumulativeBlockUnits: l.args.cumulativeBlockUnits,
      });
    }
    const rounds: ChainRound[] = [];
    for (const l of recorded) {
      rounds.push({
        roundId: l.args.roundId,
        ethereumBlockNumber: l.blockNumber,
        occurredAt: await timeOf(l.blockNumber),
        work: l.args.work,
        cumulativeWork: l.args.cumulativeWork,
        cumulativeBlockUnits: l.args.cumulativeBlockUnits,
        workPerThousandBlocks: Number(l.args.workPerThousandBlocks),
      });
    }
    settlements.sort((a, b) => Number(a.settledThroughRound - b.settledThroughRound));
    this.log.debug(`read ${settlements.length} settlements and ${rounds.length} rounds from ${fromBlock}..${toBlock}`);
    return { settlements, rounds };
  }
}

const UNITS = 1_000_000_000n;

/**
 * Work the Squeek block range out of two consecutive certified totals, the way the docs
 * define height: cumulativeBlockUnits / 1e9. Returns null when no whole block completed.
 */
export function completedRange(prevUnits: bigint, units: bigint): { first: bigint; last: bigint; count: bigint } | null {
  const before = prevUnits / UNITS;
  const after = units / UNITS;
  if (after <= before) return null;
  return { first: before + 1n, last: after, count: after - before };
}
