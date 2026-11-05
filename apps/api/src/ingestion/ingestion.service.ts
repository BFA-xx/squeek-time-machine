import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiEvent, CoreResponse, EconomyResponse, EventsResponse, SettlementsResponse, StatsResponse, StatusResponse, normalizeEvent, type NormalizedEvent } from "@stm/shared";
import type { Address } from "viem";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { StreamService } from "../stream/stream.service";
import { ArchiveWriter } from "./archive-writer.service";
import { ChainBackfillService, completedRange } from "./chain-backfill.service";
import { INSTALLATION_NOTES } from "./curated";
import { FetchOutcome, SqueekApiClient } from "./squeek-api.client";

const JOBS = { status: 5_000, events: 15_000, settlements: 30_000, core: 30_000, economy: 60_000, stats: 300_000, runs: 120_000, chain: 60_000 } as const;
type JobName = keyof typeof JOBS;
const MAX_BACKOFF = 15 * 60_000;
const JOB_LIMIT_MS = 5 * 60_000;
const CHAIN_RANGE = 5_000n;
const Runs = z.object({ schemaVersion: z.string(), installationId: z.string(), freshness: z.string().optional(), certifiedCoreWork: z.literal(false), items: z.array(z.record(z.unknown())) }).passthrough();

@Injectable()
export class IngestionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(IngestionService.name);
  private readonly timers = new Map<JobName, NodeJS.Timeout>();
  private stopped = false;
  private coreInfo: { installationId: string; core: Address; deploymentBlock: bigint; safeThroughBlock: bigint } | null = null;

  constructor(
    private readonly db: PrismaService,
    private readonly api: SqueekApiClient,
    private readonly chain: ChainBackfillService,
    private readonly writer: ArchiveWriter,
    private readonly stream: StreamService,
  ) {}

  async onApplicationBootstrap() {
    await this.writer.seedCategories();
    await this.seedCuratedNotes();
    if (process.env.INGESTION_ENABLED === "false") return;
    let delay = 0;
    for (const name of Object.keys(JOBS) as JobName[]) {
      this.schedule(name, delay);
      delay += 700;
    }
  }

  onApplicationShutdown() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
  }

  private schedule(name: JobName, ms: number) {
    if (this.stopped) return;
    this.timers.set(name, setTimeout(() => void this.runJob(name), ms));
  }

  /** A failing source backs off on its own and never takes the others, or the last good data, with it. */
  private async runJob(name: JobName) {
    let next: number = JOBS[name];
    try {
      const failure = await this.withWatchdog(name);
      const row = await this.db.dataSource.findUnique({ where: { key: `api.${name}` } });
      if (failure && row) next = Math.min(MAX_BACKOFF, JOBS[name] * 2 ** Math.min(row.failureCount, 6));
    } catch (e) {
      this.log.error(`${name}: ${(e as Error).message}`);
      await this.markFailure(name, "error", (e as Error).message);
      const row = await this.db.dataSource.findUnique({ where: { key: `api.${name}` } });
      next = Math.min(MAX_BACKOFF, JOBS[name] * 2 ** Math.min(row?.failureCount ?? 1, 6));
    }
    this.schedule(name, next);
  }

  /** A hung read, say after the host wakes from sleep, fails that one run instead of stopping its loop for good. */
  private withWatchdog(name: JobName): Promise<boolean> {
    let timer: NodeJS.Timeout;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} run exceeded ${JOB_LIMIT_MS / 1000}s`)), JOB_LIMIT_MS);
    });
    return Promise.race([this.run(name), limit]).finally(() => clearTimeout(timer));
  }

  private run(name: JobName): Promise<boolean> {
    switch (name) {
      case "status": return this.syncStatus();
      case "events": return this.syncEvents();
      case "settlements": return this.syncSettlements();
      case "core": return this.syncCore();
      case "economy": return this.syncEconomy();
      case "stats": return this.syncStats();
      case "runs": return this.syncRuns();
      case "chain": return this.syncChain();
    }
  }

  private async markOk(name: string, schemaVersion?: string) {
    const key = `api.${name}`;
    const prior = await this.db.dataSource.findUnique({ where: { key } });
    const data = { status: "ok", reason: null, lastSuccessAt: new Date(), failureCount: 0, ...(schemaVersion ? { schemaVersion } : {}) };
    await this.db.dataSource.upsert({ where: { key }, update: data, create: { key, ...data } });
    if (prior && prior.status !== "ok") this.stream.publish("source", { key, status: "ok" });
  }

  private async markFailure(name: string, status: string, reason: string) {
    const key = `api.${name}`;
    const prior = await this.db.dataSource.findUnique({ where: { key } });
    await this.db.dataSource.upsert({
      where: { key },
      update: { status, reason, lastErrorAt: new Date(), failureCount: { increment: 1 } },
      create: { key, status, reason, lastErrorAt: new Date(), failureCount: 1 },
    });
    if (!prior || prior.status !== status) {
      this.log.warn(`${key} is ${status}: ${reason}`);
      this.stream.publish("source", { key, status, reason });
    }
  }

  /** Returns the data if usable. Otherwise records why, and the last good copy stays in place. */
  private async accept<T>(name: string, outcome: FetchOutcome<T>): Promise<T | null | "unchanged"> {
    if (!outcome.ok) {
      await this.markFailure(name, outcome.kind, outcome.reason);
      return null;
    }
    if ("notModified" in outcome && outcome.notModified) {
      await this.markOk(name);
      return "unchanged";
    }
    await this.markOk(name, (outcome as { schemaVersion: string }).schemaVersion);
    return (outcome as { data: T }).data;
  }

  private async saveLastGood(key: string, body: unknown) {
    const json = body as Prisma.InputJsonValue;
    const fetchedAt = new Date();
    await this.db.lastGoodState.upsert({ where: { key }, update: { body: json, fetchedAt }, create: { key, body: json, fetchedAt } });
  }

  async seedCuratedNotes() {
    for (const n of INSTALLATION_NOTES) {
      await this.writer.touchInstallationIfMissing(n.installationId, n.releaseId);
      const at = new Date(n.occurredAt);
      await this.writer.insertEvent(n.installationId, {
        id: n.id, type: "archive.note", eventVersion: 1, category: "archive", title: n.title, summary: n.summary, significance: n.significance,
        occurredAt: at, recordedAt: at, sourceKind: "archive" as NormalizedEvent["sourceKind"], provisional: false, confirmationStatus: "archive note",
        transactionHash: null, blockNumber: null, blockHash: null, logIndex: null, contractAddress: null, installationRef: n.installationId,
        payload: { sourceRef: n.sourceRef }, searchText: `${n.title} ${n.summary}`.toLowerCase(),
      }, n.sourceRef);
    }
  }

  async syncStatus(): Promise<boolean> {
    const data = await this.accept("status", await this.api.get("status", "/v1/status", StatusResponse, { conditional: true, versionKey: "status" }));
    if (data === null) return true;
    if (data === "unchanged") return false;
    await this.saveLastGood("status", data);
    await this.writer.touchInstallationIfMissing(data.installationId);
    const m = data.measurement;
    this.stream.publish("live", {
      provisional: true,
      installationId: data.installationId,
      observedAt: m.observedAt ?? null,
      freshness: m.freshness,
      coreStatus: m.coreStatus ?? null,
      rpmMilli: m.rpmMilli ?? null,
      speedMmPerSecond: m.speedMmPerSecond ?? null,
      distanceMm: m.distanceMm ?? null,
      projectedHeight: data.builder.projected?.blockHeight ?? null,
      projectedProgress: data.builder.projected?.blockProgress ?? null,
      settledHeight: data.builder.anchor?.blockHeight ?? null,
    });
    return false;
  }

  private readEvents(cursor: string | null) {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("cursor", cursor);
    return this.api.get("events", `/v1/events?${q}`, EventsResponse, { versionKey: "events" });
  }

  private async storePage(installationId: string, raw: unknown[]): Promise<{ inserted: number; invalid: number }> {
    let inserted = 0;
    let invalid = 0;
    for (const item of raw) {
      const parsed = ApiEvent.safeParse(item);
      if (!parsed.success) {
        invalid++;
        continue;
      }
      try {
        if (await this.writer.insertEvent(installationId, normalizeEvent(parsed.data))) inserted++;
      } catch (e) {
        invalid++;
        this.log.warn(`skipped event: ${(e as Error).message}`);
      }
    }
    return { inserted, invalid };
  }

  /**
   * Two walks over one newest-first feed. "Head" stops as soon as a page holds nothing new. "Backfill"
   * keeps a saved cursor so it resumes where it stopped after a restart or an outage.
   */
  async syncEvents(maxBackfillPages = 5): Promise<boolean> {
    const first = await this.accept("events", await this.readEvents(null));
    if (first === null) return true;
    if (first === "unchanged") return false;
    const installationId = first.installationId;
    await this.writer.touchInstallationIfMissing(installationId);

    let page = first;
    let invalidTotal = 0;
    for (let i = 0; i < 20; i++) {
      const { inserted, invalid } = await this.storePage(installationId, page.events);
      invalidTotal += invalid;
      if (inserted === 0 || !page.nextCursor) break;
      const next = await this.readEvents(page.nextCursor);
      if (!next.ok || ("notModified" in next && next.notModified)) break;
      page = (next as { data: typeof first }).data;
    }

    const key = `events.backfill:${installationId}`;
    const state = await this.db.ingestionCursor.findUnique({ where: { key } });
    if ((state?.meta as { done?: boolean } | null)?.done !== true) {
      let cursor = state?.value ?? first.nextCursor;
      let done = first.nextCursor === null;
      for (let i = 0; i < maxBackfillPages && cursor && !done; i++) {
        const res = await this.readEvents(cursor);
        if (!res.ok) {
          // A cursor the API rejects means start over. Dedupe makes the second walk harmless.
          if (res.reason === "http 400" || res.reason === "http 409") cursor = first.nextCursor;
          break;
        }
        if ("notModified" in res && res.notModified) break;
        const data = (res as { data: typeof first }).data;
        invalidTotal += (await this.storePage(installationId, data.events)).invalid;
        cursor = data.nextCursor;
        if (!cursor) done = true;
      }
      await this.db.ingestionCursor.upsert({ where: { key }, update: { value: cursor ?? null, meta: { done } }, create: { key, value: cursor ?? null, meta: { done } } });
    }
    if (invalidTotal > 0) await this.markFailure("events", "error", `${invalidTotal} events failed validation and were skipped`);
    return false;
  }

  private settlementEventId(core: string, tx: string, logIndex: number | string) {
    return `chain:11155111:${core.toLowerCase()}:${tx.toLowerCase()}:${logIndex}:system.settlement_completed`;
  }

  /** Same stable id the official feed uses, so the timeline stays complete when the feed is down and never doubles up when it returns. */
  private async settlementAsEvent(installationId: string, core: string, s: { transactionHash: string; logIndex: number; ethereumBlockNumber: bigint; occurredAt: Date; previousRound: bigint; settledThroughRound: bigint; activeRoundCount: number; workAdded: bigint | null; cumulativeWork: bigint; cumulativeBlockUnits: bigint; blockHeight: bigint; firstCompletedBlock: bigint | null; lastCompletedBlock: bigint | null; completedBlockCount: bigint; confirmationStatus: string }, releaseId: string) {
    const raw = {
      id: this.settlementEventId(core, s.transactionHash, s.logIndex),
      eventVersion: 2,
      type: "system.settlement_completed",
      occurredAt: s.occurredAt.toISOString(),
      recordedAt: s.occurredAt.toISOString(),
      source: { kind: "chain", chainId: "11155111", target: "sepolia", releaseId, contractAddress: core, blockNumber: s.ethereumBlockNumber.toString(), blockHash: "", transactionHash: s.transactionHash, logIndex: String(s.logIndex), confirmationStatus: s.confirmationStatus },
      payload: {
        previousSettledThroughRound: s.previousRound.toString(), settledThroughRound: s.settledThroughRound.toString(), activeRoundCount: String(s.activeRoundCount),
        workAdded: s.workAdded?.toString() ?? "0", completedBlockCount: s.completedBlockCount.toString(), firstCompletedBlock: s.firstCompletedBlock?.toString() ?? null, lastCompletedBlock: s.lastCompletedBlock?.toString() ?? null,
        cumulativeWork: s.cumulativeWork.toString(), cumulativeBlockUnits: s.cumulativeBlockUnits.toString(), blockHeight: s.blockHeight.toString(),
      },
    };
    await this.writer.insertEvent(installationId, normalizeEvent(ApiEvent.parse(raw)));
  }

  async syncSettlements(): Promise<boolean> {
    const data = await this.accept("settlements", await this.api.get("settlements", "/v1/settlements", SettlementsResponse, { conditional: true, versionKey: "settlements" }));
    if (data === null) return true;
    if (data === "unchanged") return false;
    await this.saveLastGood("settlements", { summary: data.summary, chain: data.chain, mining: data.mining ?? null, recentRounds: data.recentRounds ?? [] });
    await this.writer.touchInstallationIfMissing(data.installationId);
    const inst = await this.db.installation.findUnique({ where: { id: data.installationId } });
    for (const item of data.recentSettlements) {
      const s = this.writer.settlementFromApi(item);
      await this.writer.insertSettlement(data.installationId, s);
      if (inst?.coreAddress) await this.settlementAsEvent(data.installationId, inst.coreAddress, s, inst.releaseId ?? data.installationId);
    }
    await this.refreshDerived(data.installationId);
    return false;
  }

  private async refreshDerived(installationId: string, mintedBaseUnits?: bigint, observedAt?: Date) {
    const [top, settlements] = await Promise.all([
      this.db.blockRecord.findFirst({ where: { installationId }, orderBy: { height: "desc" }, select: { height: true } }),
      this.db.settlementRecord.count({ where: { installationId } }),
    ]);
    await this.writer.recordDerivedMilestones(installationId, { blockHeight: top?.height ?? 0n, settlements: BigInt(settlements), mintedBaseUnits, observedAt });
  }

  async syncCore(): Promise<boolean> {
    const data = await this.accept("core", await this.api.get("core", "/v1/core", CoreResponse, { conditional: true, versionKey: "core" }));
    if (data === null) return true;
    if (data === "unchanged") return false;
    await this.saveLastGood("core", { installationId: data.installationId, chain: data.chain, identities: data.identities, configuration: data.configuration, core: data.core });
    await this.writer.touchInstallation(data.installationId, {
      releaseId: (data as { release?: { id?: string } }).release?.id,
      coreAddress: data.identities.core,
      deploymentBlock: BigInt(data.chain.deploymentBlock),
      genesisTimestamp: BigInt(data.configuration.genesisTimestamp),
      lastTotals: { cumulativeWork: data.core.cumulativeWork, blockHeight: data.core.blockHeight, workPerThousandBlocks: data.core.workPerThousandBlocks },
    });
    this.coreInfo = { installationId: data.installationId, core: data.identities.core as Address, deploymentBlock: BigInt(data.chain.deploymentBlock), safeThroughBlock: BigInt(data.chain.safeThroughBlock) };
    return false;
  }

  async syncEconomy(): Promise<boolean> {
    const data = await this.accept("economy", await this.api.get("economy", "/v1/economy/state", EconomyResponse, { conditional: true, versionKey: "economy" }));
    if (data === null) return true;
    if (data === "unchanged") return false;
    const { deployment: _d, capabilities: _c, ...economyBody } = data as typeof data & { capabilities?: unknown };
    await this.saveLastGood("economy", economyBody);
    const coreAddress = data.identities?.core ?? data.deployment?.components.core.address;
    await this.writer.touchInstallation(data.installationId, { releaseId: data.release.id, coreAddress, deploymentBlock: BigInt(data.chain.deploymentBlock) });
    if (coreAddress) this.coreInfo = { installationId: data.installationId, core: coreAddress as Address, deploymentBlock: BigInt(data.chain.deploymentBlock), safeThroughBlock: BigInt(data.chain.safeThroughBlock) };
    const core = await this.db.lastGoodState.findUnique({ where: { key: "core" } });
    // The economy read only gets paired with a core read of the same installation. Mixed releases would chart nonsense.
    const totals = (core?.body as { core?: { blockHeight: string; cumulativeWork: string; workPerThousandBlocks: string; settledThroughRound: string }; installationId?: string } | null);
    if (totals?.core && totals.installationId === data.installationId) {
      const at = new Date((data as { generatedAt?: string }).generatedAt ?? Date.now());
      await this.writer.recordMining(data.installationId, {
        capturedAt: at, safeBlock: BigInt(data.chain.safeThroughBlock), blockHeight: BigInt(totals.core.blockHeight), cumulativeWork: BigInt(totals.core.cumulativeWork),
        workPerThousandBlocks: Number(totals.core.workPerThousandBlocks), settledThroughRound: BigInt(totals.core.settledThroughRound),
        mintedBaseUnits: data.supply.totalMintedBaseUnits, liveSupplyBaseUnits: data.supply.liveSupplyBaseUnits, stakedBaseUnits: data.staking?.totalStakedBaseUnits ?? null,
        nftLive: Number(data.nft.live), nftBurned: Number(data.nft.burned),
      });
    }
    await this.refreshDerived(data.installationId, BigInt(data.supply.miningMintedBaseUnits), new Date());
    return false;
  }

  async syncStats(): Promise<boolean> {
    const data = await this.accept("stats", await this.api.get("stats", "/v1/measurement/stats?range=30d", StatsResponse, { conditional: true, versionKey: "stats" }));
    if (data === null) return true;
    if (data === "unchanged") return false;
    await this.writer.touchInstallationIfMissing(data.installationId);
    await this.saveLastGood("stats", { installationId: data.installationId, generatedAt: data.generatedAt, lifetime: data.lifetime, records: data.records, rounds: data.rounds ?? null, typicalDay: data.activity.typicalDay ?? [], provenance: "accepted_rounds" });
    for (const d of data.activity.days) {
      // Only days with real coverage. A missing day stays missing and isn't stored as zero.
      if (d.coverage.observedRoundCount === 0) continue;
      const row = { distanceMm: d.distanceMm === null ? null : BigInt(d.distanceMm), workUnits: d.observedWorkUnits === null ? null : BigInt(d.observedWorkUnits), coverageBps: d.coverage.coverageBps, buckets: (d.buckets ?? []) as Prisma.InputJsonValue };
      await this.db.wheelDay.upsert({ where: { installationId_date: { installationId: data.installationId, date: d.date } }, update: row, create: { installationId: data.installationId, date: d.date, ...row } });
    }
    this.stream.publish("wheel", { generatedAt: data.generatedAt });
    return false;
  }

  async syncRuns(): Promise<boolean> {
    const data = await this.accept("runs", await this.api.get("runs", "/v1/measurement/runs?limit=20", Runs));
    if (data === null) return true;
    if (data === "unchanged") return false;
    await this.saveLastGood("runs", { freshness: data.freshness ?? null, certifiedCoreWork: false, items: data.items.map(({ passages: _omit, ...rest }) => rest) });
    return false;
  }

  /** Walks the contract's logs from deployment. Resumes from its saved block and needs no API to have kept the history. */
  async syncChain(): Promise<boolean> {
    if (!this.coreInfo) {
      const c = await this.db.lastGoodState.findUnique({ where: { key: "core" } });
      const body = c?.body as { installationId: string; identities: { core: Address }; chain: { deploymentBlock: string; safeThroughBlock: string } } | null;
      if (!body) return false;
      this.coreInfo = { installationId: body.installationId, core: body.identities.core, deploymentBlock: BigInt(body.chain.deploymentBlock), safeThroughBlock: BigInt(body.chain.safeThroughBlock) };
    }
    const { installationId, core, deploymentBlock } = this.coreInfo;
    const key = `chain.backfill:${installationId}`;
    const state = await this.db.ingestionCursor.findUnique({ where: { key } });
    const meta = (state?.meta ?? {}) as { units?: string; work?: string; height?: string };
    let from = state?.value ? BigInt(state.value) + 1n : deploymentBlock;
    let units = BigInt(meta.units ?? "0");
    let work = BigInt(meta.work ?? "0");
    const inst = await this.db.installation.findUnique({ where: { id: installationId } });
    const tip = (await this.chain.latestBlock()) - 12n;
    for (let i = 0; i < 12 && from <= tip; i++) {
      const to = from + CHAIN_RANGE - 1n > tip ? tip : from + CHAIN_RANGE - 1n;
      const { settlements, rounds } = await this.chain.read(core, from, to);
      for (const r of rounds) {
        const height = r.cumulativeBlockUnits / 1_000_000_000n;
        await this.writer.recordMining(installationId, { capturedAt: r.occurredAt, safeBlock: r.ethereumBlockNumber, blockHeight: height, cumulativeWork: r.cumulativeWork, workPerThousandBlocks: r.workPerThousandBlocks, settledThroughRound: r.roundId });
      }
      for (const s of settlements) {
        const range = completedRange(units, s.cumulativeBlockUnits);
        const row = {
          transactionHash: s.transactionHash, logIndex: s.logIndex, ethereumBlockNumber: s.ethereumBlockNumber, occurredAt: s.occurredAt, previousRound: s.previousRound, settledThroughRound: s.settledThroughRound,
          activeRoundCount: s.activeRoundCount, workAdded: s.cumulativeWork - work, cumulativeWork: s.cumulativeWork, cumulativeBlockUnits: s.cumulativeBlockUnits, blockHeight: s.cumulativeBlockUnits / 1_000_000_000n,
          firstCompletedBlock: range?.first ?? null, lastCompletedBlock: range?.last ?? null, completedBlockCount: range?.count ?? 0n, sqkMinted: null, confirmationStatus: "safe", source: "chain" as const,
        };
        await this.writer.insertSettlement(installationId, row);
        await this.settlementAsEvent(installationId, core, row, inst?.releaseId ?? installationId);
        units = s.cumulativeBlockUnits;
        work = s.cumulativeWork;
      }
      const m = { units: units.toString(), work: work.toString() };
      await this.db.ingestionCursor.upsert({ where: { key }, update: { value: to.toString(), meta: m }, create: { key, value: to.toString(), meta: m } });
      from = to + 1n;
    }
    await this.markOk("chain");
    await this.refreshDerived(installationId);
    return false;
  }
}
