import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CHAIN_ABI, CONTRACTS, CONTRIBUTION_POINTS, DAILY_CONTRIBUTION_CAP, PINNED_RELEASE, QUIET_CHECKPOINT_POINTS, type ContributionKind } from "@stm/shared";
import { decodeEventLog, decodeFunctionData, parseAbi } from "viem";
import { PrismaService } from "../common/prisma.service";
import { ChainBackfillService } from "../ingestion/chain-backfill.service";
import { StreamService } from "../stream/stream.service";
import { DigService } from "./dig.service";

const mining = parseAbi(CHAIN_ABI.mining);
const staking = parseAbi(CHAIN_ABI.staking);
const nft = parseAbi(CHAIN_ABI.nft);

/** Credits a real transaction only after reading it from the chain. The server never signs or sends anything. */
@Injectable()
export class ContributionService {
  constructor(private readonly db: PrismaService, private readonly chain: ChainBackfillService, private readonly dig: DigService, private readonly stream: StreamService) {}

  /** What a transaction did, judged only from its receipt and input. Null means it isn't a contribution. */
  classify(tx: NonNullable<Awaited<ReturnType<ChainBackfillService["readTx"]>>>): { kind: ContributionKind; tokenIds: string[]; points: number } | null {
    const to = tx.to?.toLowerCase();
    if (tx.status !== "success" || !to) return null;
    try {
      if (to === CONTRACTS.mining) {
        const { functionName } = decodeFunctionData({ abi: mining, data: tx.input });
        if (functionName !== "checkpoint") return null;
        // "When nothing new is settled it returns without effect", so no event means it did nothing.
        for (const log of tx.logs) {
          if (log.address.toLowerCase() !== CONTRACTS.mining) continue;
          try {
            const e = decodeEventLog({ abi: mining, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], strict: true });
            if (e.eventName === "Checkpointed") {
              return { kind: "checkpoint", tokenIds: [], points: (e.args as { completedBlocks: bigint }).completedBlocks > 0n ? CONTRIBUTION_POINTS.checkpoint : QUIET_CHECKPOINT_POINTS };
            }
          } catch {}
        }
        return null;
      }
      if (to === CONTRACTS.staking) {
        const call = decodeFunctionData({ abi: staking, data: tx.input });
        if (call.functionName === "deposit") return { kind: "deposit", tokenIds: (call.args[1] as readonly bigint[]).map(String), points: CONTRIBUTION_POINTS.deposit };
        if (call.functionName === "claim") return { kind: "claim", tokenIds: [], points: CONTRIBUTION_POINTS.claim };
        if (call.functionName === "claimAndStake") return { kind: "claimAndStake", tokenIds: [], points: CONTRIBUTION_POINTS.claimAndStake };
        if (call.functionName === "mergeDeposited") return { kind: "merge", tokenIds: [String(call.args[1]), String(call.args[2])], points: CONTRIBUTION_POINTS.merge };
        return null;
      }
      if (to === CONTRACTS.nft) {
        const call = decodeFunctionData({ abi: nft, data: tx.input });
        if (call.functionName === "merge") return { kind: "merge", tokenIds: [String(call.args[0]), String(call.args[1])], points: CONTRIBUTION_POINTS.merge };
      }
    } catch {}
    return null;
  }

  async credit(user: { id: string; walletAddress: string | null }, txHash: unknown) {
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new BadRequestException("That isn't a transaction hash.");
    if (!user.walletAddress) throw new BadRequestException("Link the wallet you sent this from to get credit for it.");
    const hash = txHash.toLowerCase();
    if (await this.db.digContribution.findUnique({ where: { txHash: hash } })) throw new ConflictException("That transaction has already been counted.");
    const season = await this.dig.season();
    if (!season) throw new ServiceUnavailableException("The current release isn't known yet. Try again shortly.");
    const release = await this.db.installation.findUnique({ where: { id: season.id }, select: { releaseId: true } });
    if (release?.releaseId && release.releaseId !== PINNED_RELEASE) throw new ServiceUnavailableException("A new Squeekchain release is live, so contributions are paused until this site is updated.");
    const tx = await this.chain.readTx(hash as `0x${string}`);
    if (!tx) throw new ServiceUnavailableException("That transaction isn't confirmed yet. Try again in a minute.");
    if (tx.from.toLowerCase() !== user.walletAddress.toLowerCase()) throw new ForbiddenException("That transaction came from a different wallet than the one linked to your account.");
    const found = this.classify(tx);
    if (!found) throw new BadRequestException("That transaction didn't make a contribution this game counts.");
    const member = await this.db.digMember.findUnique({ where: { userId_installationId: { userId: user.id, installationId: season.id } } });
    let points = found.points;
    if (found.kind === "deposit") {
      // Each Squeek counts once, so depositing and withdrawing the same one can't farm points.
      const past = await this.db.digContribution.findMany({ where: { userId: user.id, installationId: season.id, kind: "deposit" }, select: { tokenIds: true } });
      const seen = new Set(past.flatMap((p) => p.tokenIds));
      if (found.tokenIds.every((t) => seen.has(t))) points = 0;
    }
    if (found.kind !== "checkpoint") {
      const since = new Date(Date.now() - 24 * 3600_000);
      const today = await this.db.digContribution.aggregate({ where: { userId: user.id, createdAt: { gte: since }, kind: { not: "checkpoint" } }, _sum: { points: true } });
      points = Math.min(points, Math.max(0, DAILY_CONTRIBUTION_CAP - (today._sum.points ?? 0)));
    }
    await this.db.digContribution.create({ data: { txHash: hash, userId: user.id, installationId: season.id, crew: member?.crew ?? null, kind: found.kind, points, tokenIds: found.tokenIds, blockNumber: tx.blockNumber } });
    this.stream.publish("dig", { kind: "contribution", contribution: found.kind, points });
    return { kind: found.kind, points };
  }
}
