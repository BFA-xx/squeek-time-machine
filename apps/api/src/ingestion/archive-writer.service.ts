import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CATEGORIES, blocksFromSettlement, milestonesCrossed, type NormalizedEvent, type SettlementItem } from "@stm/shared";
import { PrismaService } from "../common/prisma.service";
import { StreamService } from "../stream/stream.service";

export const ARCHIVE_SOURCE = "https://docs.squeekchain.com/developers/api/";

function sourceRef(e: NormalizedEvent): string {
  return e.transactionHash ? `https://sepolia.etherscan.io/tx/${e.transactionHash}` : "https://api.squeekchain.com/v1/events";
}

/** All record writes. Insert-only: a repeat is a no-op, and a changed fact becomes a RecordCorrection. */
@Injectable()
export class ArchiveWriter {
  constructor(private readonly db: PrismaService, private readonly stream: StreamService) {}

  async seedCategories() {
    for (const c of CATEGORIES) {
      await this.db.eventCategory.upsert({ where: { slug: c.slug }, update: { label: c.label, group: c.group }, create: { slug: c.slug, label: c.label, group: c.group } });
    }
  }

  async touchInstallation(id: string, data: { releaseId?: string; coreAddress?: string; deploymentBlock?: bigint; genesisTimestamp?: bigint; lastTotals?: Prisma.InputJsonValue }) {
    await this.db.installation.upsert({ where: { id }, update: { ...data, lastSeenAt: new Date() }, create: { id, ...data } });
  }

  async touchInstallationIfMissing(id: string, releaseId?: string) {
    await this.db.installation.upsert({ where: { id }, update: { lastSeenAt: new Date() }, create: { id, releaseId } });
  }

  /** Returns true only when this event is new, so replays and overlapping pages stay silent. */
  async insertEvent(installationId: string, e: NormalizedEvent, explicitSourceRef?: string): Promise<boolean> {
    const existing = await this.db.historicalEvent.findUnique({ where: { id: e.id }, select: { id: true, confirmationStatus: true, occurredAt: true } });
    if (existing) {
      if (existing.confirmationStatus !== e.confirmationStatus) {
        await this.db.$transaction([
          this.db.recordCorrection.create({ data: { recordType: "event", recordId: e.id, field: "confirmationStatus", oldValue: existing.confirmationStatus, newValue: e.confirmationStatus, reason: "source reported a new confirmation state", source: "api.events" } }),
          this.db.historicalEvent.update({ where: { id: e.id }, data: { confirmationStatus: e.confirmationStatus } }),
        ]);
      }
      if (existing.occurredAt.getTime() !== e.occurredAt.getTime()) {
        await this.db.recordCorrection.create({ data: { recordType: "event", recordId: e.id, field: "occurredAt", oldValue: existing.occurredAt.toISOString(), newValue: e.occurredAt.toISOString(), reason: "source disagrees with the stored time; stored value kept pending review", source: "api.events" } });
      }
      return false;
    }
    try {
      await this.db.historicalEvent.create({
        data: {
          id: e.id,
          installationId,
          type: e.type,
          eventVersion: e.eventVersion,
          categorySlug: e.category,
          title: e.title,
          summary: e.summary,
          significance: e.significance,
          occurredAt: e.occurredAt,
          recordedAt: e.recordedAt,
          sourceKind: e.sourceKind,
          provisional: e.provisional,
          confirmationStatus: e.confirmationStatus,
          transactionHash: e.transactionHash,
          blockNumber: e.blockNumber === null ? null : BigInt(e.blockNumber),
          blockHash: e.blockHash,
          logIndex: e.logIndex,
          contractAddress: e.contractAddress,
          sourceRef: explicitSourceRef ?? sourceRef(e),
          payload: e.payload as Prisma.InputJsonValue,
          searchText: e.searchText,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
    this.stream.publish("event", { id: e.id, title: e.title, type: e.type, category: e.category, occurredAt: e.occurredAt, provisional: e.provisional, significance: e.significance });
    if (e.category === "milestone" || e.category === "record") {
      await this.insertMilestone(installationId, { key: `event:${e.id}`, kind: e.category, title: e.title, description: e.summary, value: e.type, achievedAt: e.occurredAt, eventId: e.id });
    }
    return true;
  }

  async insertMilestone(installationId: string, m: { key: string; kind: string; title: string; description: string; value: string; achievedAt: Date; eventId?: string }): Promise<boolean> {
    const r = await this.db.milestone.createMany({ data: [{ ...m, installationId }], skipDuplicates: true });
    if (r.count === 1) {
      this.stream.publish("milestone", { key: m.key, title: m.title, kind: m.kind, achievedAt: m.achievedAt });
      return true;
    }
    return false;
  }

  async insertSettlement(installationId: string, s: {
    transactionHash: string; logIndex: number; ethereumBlockNumber: bigint; occurredAt: Date; previousRound: bigint; settledThroughRound: bigint;
    activeRoundCount: number; workAdded: bigint | null; cumulativeWork: bigint; cumulativeBlockUnits: bigint; blockHeight: bigint;
    firstCompletedBlock: bigint | null; lastCompletedBlock: bigint | null; completedBlockCount: bigint; sqkMinted: string | null; confirmationStatus: string; source: "api" | "chain";
  }): Promise<{ created: boolean; newBlocks: number }> {
    const id = `${s.transactionHash}:${s.logIndex}`;
    const known = await this.db.settlementRecord.findUnique({ where: { id }, select: { id: true, sqkMintedBaseUnits: true } });
    if (known) {
      if (known.sqkMintedBaseUnits === null && s.sqkMinted !== null) {
        await this.db.settlementRecord.update({ where: { id }, data: { sqkMintedBaseUnits: new Prisma.Decimal(s.sqkMinted) } });
      }
      return { created: false, newBlocks: 0 };
    }
    const heights = s.firstCompletedBlock === null
      ? []
      : blocksFromSettlement({ transactionHash: s.transactionHash, firstCompletedBlock: s.firstCompletedBlock.toString(), lastCompletedBlock: s.lastCompletedBlock!.toString(), completedBlockCount: s.completedBlockCount.toString() });
    const { transactionHash, logIndex, sqkMinted, ...rest } = s;
    let newBlocks = 0;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.settlementRecord.create({
          data: { id, installationId, transactionHash, logIndex, ...rest, cumulativeBlockUnits: new Prisma.Decimal(s.cumulativeBlockUnits.toString()), sqkMintedBaseUnits: sqkMinted === null ? null : new Prisma.Decimal(sqkMinted) },
        });
        if (heights.length) {
          const r = await tx.blockRecord.createMany({ data: heights.map((height) => ({ installationId, height, settlementId: id, completedAt: s.occurredAt })), skipDuplicates: true });
          newBlocks = r.count;
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { created: false, newBlocks: 0 };
      throw err;
    }
    this.stream.publish("settlement", { id, occurredAt: s.occurredAt, settledThroughRound: s.settledThroughRound.toString(), completedBlockCount: s.completedBlockCount.toString(), blockHeight: s.blockHeight.toString() });
    if (newBlocks > 0) this.stream.publish("block", { first: s.firstCompletedBlock!.toString(), last: s.lastCompletedBlock!.toString(), height: s.blockHeight.toString(), at: s.occurredAt });
    return { created: true, newBlocks };
  }

  settlementFromApi(item: SettlementItem) {
    const first = item.firstCompletedBlock === null ? null : BigInt(item.firstCompletedBlock);
    const last = item.lastCompletedBlock === null ? null : BigInt(item.lastCompletedBlock);
    return {
      transactionHash: item.transactionHash,
      logIndex: Number(item.logIndex),
      ethereumBlockNumber: BigInt(item.ethereumBlockNumber),
      occurredAt: new Date(item.blockTimestamp),
      previousRound: BigInt(item.previousSettledThroughRound),
      settledThroughRound: BigInt(item.settledThroughRound),
      activeRoundCount: Number(item.activeRoundCount),
      workAdded: BigInt(item.workAdded),
      cumulativeWork: BigInt(item.cumulativeWork),
      cumulativeBlockUnits: BigInt(item.cumulativeBlockUnits),
      blockHeight: BigInt(item.blockHeight),
      firstCompletedBlock: first,
      lastCompletedBlock: last,
      completedBlockCount: BigInt(item.completedBlockCount),
      sqkMinted: item.sqkMintedBaseUnits ?? null,
      confirmationStatus: item.confirmationStatus,
      source: "api" as const,
    };
  }

  /**
   * Milestones computed from confirmed totals carry the time of the record that crossed the
   * line: the block's settlement, or the nth settlement. If that record isn't stored yet the
   * milestone waits, because a guessed date would be worse than a late one.
   */
  async recordDerivedMilestones(installationId: string, totals: { blockHeight: bigint; settlements: bigint; mintedBaseUnits?: bigint; observedAt?: Date }) {
    for (const m of milestonesCrossed(installationId, totals)) {
      let achievedAt: Date | undefined;
      let description = m.description;
      if (m.kind === "blocks") {
        const b = await this.db.blockRecord.findUnique({ where: { installationId_height: { installationId, height: BigInt(m.value) } }, select: { completedAt: true } });
        achievedAt = b?.completedAt;
      } else if (m.kind === "settlements") {
        const row = await this.db.settlementRecord.findFirst({ where: { installationId }, orderBy: { settledThroughRound: "asc" }, skip: Number(m.value) - 1, select: { occurredAt: true } });
        achievedAt = row?.occurredAt;
      } else if (totals.observedAt) {
        achievedAt = totals.observedAt;
        description = `${m.description} First observed by this archive at this time.`;
      }
      if (achievedAt) await this.insertMilestone(installationId, { key: m.key, kind: m.kind, title: m.title, description, value: m.value, achievedAt });
    }
  }

  async recordMining(installationId: string, r: { capturedAt: Date; safeBlock: bigint; blockHeight: bigint; cumulativeWork: bigint; workPerThousandBlocks: number; settledThroughRound: bigint; mintedBaseUnits?: string | null; liveSupplyBaseUnits?: string | null; stakedBaseUnits?: string | null; nftLive?: number | null; nftBurned?: number | null }): Promise<boolean> {
    const dec = (v?: string | null) => (v === undefined || v === null ? null : new Prisma.Decimal(v));
    const res = await this.db.miningRecord.createMany({
      data: [{ installationId, capturedAt: r.capturedAt, safeBlock: r.safeBlock, blockHeight: r.blockHeight, cumulativeWork: r.cumulativeWork, workPerThousandBlocks: r.workPerThousandBlocks, settledThroughRound: r.settledThroughRound, mintedBaseUnits: dec(r.mintedBaseUnits), liveSupplyBaseUnits: dec(r.liveSupplyBaseUnits), stakedBaseUnits: dec(r.stakedBaseUnits), nftLive: r.nftLive ?? null, nftBurned: r.nftBurned ?? null }],
      skipDuplicates: true,
    });
    if (res.count === 1) this.stream.publish("mining", { blockHeight: r.blockHeight.toString(), workPerThousandBlocks: r.workPerThousandBlocks, capturedAt: r.capturedAt });
    return res.count === 1;
  }
}
