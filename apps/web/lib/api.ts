"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const API = "/api/v1";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("The archive can't be reached right now.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new ApiError("The archive can't be reached right now.", res.status);
  }
  if (!res.ok) {
    const m = (data as { message?: string | string[] } | null)?.message;
    const message = res.status === 429 ? (typeof m === "string" && !/ThrottlerException/.test(m) ? m : "Too many requests. Try again shortly.") : Array.isArray(m) ? m[0] : m ?? "Something went wrong.";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (path === null) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await api<T>(path);
      if (mine === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload, setData };
}

export interface EventSummary {
  id: string; type: string; categorySlug: string; title: string; summary: string; significance: number; occurredAt: string;
  provisional: boolean; confirmationStatus: string; transactionHash: string | null; sourceKind: string; installationId: string; comments: number;
}
export interface RelatedEvent { id: string; title: string; type: string; categorySlug: string; occurredAt: string; provisional: boolean; significance: number }
export interface EventDetail extends Omit<EventSummary, "comments"> {
  recordedAt: string; blockNumber: string | null; blockHash: string | null; logIndex: number | null; contractAddress: string | null; sourceRef: string | null;
  payload: Record<string, unknown>; eventVersion: number;
  category: { slug: string; label: string; group: string };
  installation: { id: string; releaseId: string | null };
  milestones: { key: string; title: string }[];
  settlement: SettlementRow | null;
  corrections: { id: string; field: string; oldValue: string | null; newValue: string | null; reason: string; source: string; createdAt: string }[];
  related: { before: RelatedEvent | null; after: RelatedEvent | null; sameTransaction: RelatedEvent[]; sameType: RelatedEvent[] };
}
export interface SettlementRow {
  id: string; transactionHash: string; logIndex: number; ethereumBlockNumber: string; occurredAt: string; previousRound: string; settledThroughRound: string; activeRoundCount: number;
  workAdded: string | null; cumulativeWork: string; cumulativeBlockUnits: string; blockHeight: string; firstCompletedBlock: string | null; lastCompletedBlock: string | null; completedBlockCount: string;
  sqkMintedBaseUnits: string | null; confirmationStatus: string; source: string;
}
export interface BlockSummary { height: string; completedAt: string; settlementId: string }
export interface BlockDetail extends BlockSummary { installationId: string; settlement: SettlementRow; previous: string | null; next: string | null; event: { id: string; title: string } | null; note: string }
export interface SourceHealth { key: string; status: string; reason: string | null; lastSuccessAt: string | null; stale: boolean }
export interface Measurement { freshness?: string; observedAt?: string | null; coreStatus?: string | null; rpmMilli?: number | null; speedMmPerSecond?: number | null; distanceMm?: number | null; provenance?: string | null; staleAfterSeconds?: number }
export interface WorldState {
  installationId: string | null;
  live: { provisional: true; fetchedAt: string; ageMs: number; measurement: Measurement | null; settled: { blockHeight: string; blockProgress: string; cumulativeWork: string; workPerThousandBlocks: string; settledThroughRound: string; confirmedAt?: string | null; transactionHash?: string | null } | null; projected: { blockHeight: string; blockProgress: string } | null } | null;
  core: { blockHeight: string; cumulativeWork: string; workPerThousandBlocks: string; settledThroughRound: string; blockProgress: string } | null;
  economy: { supply?: { capBaseUnits: string; miningMintedBaseUnits: string; liveSupplyBaseUnits: string; premintBaseUnits?: string }; staking?: { totalStakedBaseUnits: string } | null; nft?: { live: string; burned: string; issued: string; mergesOpen: boolean; maximumLevel?: number } } | null;
  economyFetchedAt: string | null;
  counts: { events: number; blocks: number; memories: number };
  latest: { id: string; title: string; occurredAt: string; provisional: boolean } | null;
  sources: SourceHealth[];
}
export interface Memory { id: string; subject: string; kind: string; body: string; createdAt: string; username: string; displayName?: string | null; reactions: Record<string, number> }
export interface CommentRow { id: string; subject: string; parentId: string | null; body: string; createdAt: string; username: string; displayName?: string | null; reactions: Record<string, number> }
export interface PollRow { id: string; question: string; scope: string; createdAt: string; username: string; options: { id: string; label: string; votes: number }[]; myVote: string | null }
export interface FeedRow { id: string; kind: string; subject: string; excerpt: string | null; createdAt: string; username: string; displayName?: string | null }
export interface Me { id: string; username: string; displayName: string | null; bio: string; wallet: string | null; role: string }
export interface OriginArtifact { slug: string; shape: string; title: string; body: string; source: string }
export interface MilestoneRow { key: string; kind: string; title: string; description: string; value: string; achievedAt: string; eventId: string | null; installationId: string }

export function subjectHref(subject: string): string | null {
  if (subject.startsWith("event:")) return `/moment/${encodeURIComponent(subject.slice(6))}`;
  if (subject.startsWith("block:")) return `/block/${subject.slice(6)}`;
  return null;
}
