"use client";
import { CATEGORIES, formatInt, formatSqk, formatUtc } from "@stm/shared";
import { useEffect, useState } from "react";
import { api, useApi, type BlockDetail, type BlockSummary, type EventDetail, type EventSummary, type RelatedEvent, type SettlementRow } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { Discussion, IWasHere, ReactionRow } from "./discussion";
import { Empty, ErrorNote, Facts, Heading, Loading, PanelLink, ProofBadge, Section, ShareBar, Time, TxLink, proofOf } from "./ui";

const EXPLAIN: Record<string, string> = {
  settlement: "A settlement is the transaction that records wheel work on Ethereum. It moves the certified frontier forward, even when no work happened.",
  checkpoint: "A checkpoint turns settled rounds into issued SQK.",
  milestone: "The wheel's own measurements crossed a threshold the official feed tracks. These come from the device, and they aren't certified on Ethereum.",
  record: "A new best from the wheel's own measurements. It comes from the device, and it isn't certified on Ethereum.",
  merge: "Merging turns two same-level Squeeks into one a level higher, and permanently burns the donor.",
  squeek: "A Squeek moved in or out of staking, or was claimed.",
  rewards: "An account moved SQK: claiming rewards, staking, or leaving staking.",
  archive: "A note written by this archive's curator, because the official feed no longer serves this period.",
  other: "An event type this archive doesn't have a description for yet.",
};

export function EventRow({ e, compact }: { e: Pick<EventSummary, "id" | "title" | "occurredAt" | "provisional"> & { summary?: string; sourceKind?: string; comments?: number }; compact?: boolean }) {
  const open = useWorld((s) => s.openPanel);
  return (
    <button onClick={() => open({ kind: "event", id: e.id })} className="w-full text-left card p-3 hover:border-gold transition-colors block">
      <div className="flex items-start justify-between gap-2">
        <span className="title text-xl text-ink">{e.title}</span>
        {typeof e.comments === "number" && e.comments > 0 && <span className="font-data text-xs text-gray shrink-0">{e.comments} 🗨</span>}
      </div>
      {!compact && e.summary && <p className="text-sm text-dim mt-1">{e.summary}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-1.5"><Time at={e.occurredAt} />{!compact && <ProofBadge kind={proofOf({ provisional: e.provisional, sourceKind: e.sourceKind ?? "chain" })} />}</div>
    </button>
  );
}

const Related = ({ label, e }: { label: string; e: RelatedEvent }) => (
  <PanelLink to={{ kind: "event", id: e.id }} className="block w-full text-left card p-2 hover:border-gold">
    <span className="label">{label}</span><span className="block text-sm text-ink">{e.title}</span><Time at={e.occurredAt} />
  </PanelLink>
);

export function EventView({ id }: { id: string }) {
  const { data: e, error, loading, reload } = useApi<EventDetail>(`/events/${encodeURIComponent(id)}`);
  const { data: reactions } = useApi<Record<string, number>>(`/community/reactions?subject=${encodeURIComponent(`event:${id}`)}`);
  if (loading && !e) return <Loading />;
  if (error || !e) return <ErrorNote retry={reload}>{error ?? "That record couldn't be found."}</ErrorNote>;
  const path = `/moment/${encodeURIComponent(e.id)}`;
  const s = e.settlement;
  return (
    <article>
      <Heading eyebrow={e.category.label} title={e.title} />
      <div className="flex flex-wrap items-center gap-2 -mt-2 mb-3"><ProofBadge kind={proofOf(e)} /><Time at={e.occurredAt} /></div>
      <p className="text-sm text-ink">{e.summary}</p>
      <p className="text-sm text-gray mt-2">{EXPLAIN[e.categorySlug] ?? ""}</p>
      {e.provisional && <p className="text-xs text-amber mt-2">This is a device measurement. Only settled work is certified on Ethereum.</p>}
      <ShareBar path={path} subject={`event:${e.id}`} text={`${e.title}. Squeekchain history, on the Squeek Time Machine.`} />
      {reactions && <div className="mt-3"><ReactionRow subject={`event:${e.id}`} counts={reactions} /></div>}

      <Section title="Record">
        <Facts rows={[
          ["Happened", formatUtc(e.occurredAt)],
          ["Recorded", formatUtc(e.recordedAt)],
          ["Status", e.confirmationStatus],
          ["Source", e.sourceKind === "chain" ? "Ethereum Sepolia" : e.sourceKind === "measurement" ? "WHEELY9000 measurement" : "Archive note"],
          ["Installation", <span key="i" className="font-data text-xs break-all">{e.installation.id}</span>],
          ...(e.transactionHash ? [["Transaction", <TxLink key="t" hash={e.transactionHash} />] as [string, React.ReactNode]] : []),
          ...(e.blockNumber ? [["Ethereum block", formatInt(e.blockNumber)] as [string, React.ReactNode]] : []),
          ...(e.sourceRef ? [["Reference", <a key="r" className="text-sky underline underline-offset-2 text-xs break-all" href={e.sourceRef} target="_blank" rel="noopener noreferrer nofollow">{e.sourceRef}</a>] as [string, React.ReactNode]] : []),
        ]} />
      </Section>

      {s && (
        <Section title="Settlement">
          <Facts rows={[
            ["Rounds", `${s.previousRound} → ${s.settledThroughRound}`],
            ["Active rounds", String(s.activeRoundCount)],
            ["Work added", s.workAdded === null ? "unknown" : formatInt(s.workAdded)],
            ["Blocks", s.firstCompletedBlock ? `${s.firstCompletedBlock}–${s.lastCompletedBlock}` : "none completed"],
            ["SQK issued", s.sqkMintedBaseUnits === null ? "not recorded here" : `${formatSqk(s.sqkMintedBaseUnits, 2)} SQK`],
          ]} />
          {s.firstCompletedBlock && <div className="mt-2"><PanelLink to={{ kind: "block", height: s.firstCompletedBlock }}>Open block {s.firstCompletedBlock} in the Vault</PanelLink></div>}
        </Section>
      )}

      {e.corrections.length > 0 && (
        <Section title="Corrections">
          <ul className="space-y-1 text-xs text-dim">{e.corrections.map((c) => <li key={c.id}>{formatUtc(c.createdAt)}: {c.field} changed from “{c.oldValue}” to “{c.newValue}”. {c.reason}.</li>)}</ul>
        </Section>
      )}

      <Section title="Original data">
        <details className="card p-2"><summary className="label cursor-pointer">Show the source payload</summary><pre className="text-xs text-dim overflow-auto mt-2 font-data scrollbar-thin">{JSON.stringify(e.payload, null, 2)}</pre></details>
      </Section>

      <Section title="Before and after">
        <div className="grid sm:grid-cols-2 gap-2">
          {e.related.before && <Related label="Earlier" e={e.related.before} />}
          {e.related.after && <Related label="Later" e={e.related.after} />}
        </div>
        {e.related.sameTransaction.length > 0 && <div className="mt-2 space-y-2">{e.related.sameTransaction.map((r) => <Related key={r.id} label="Same transaction" e={r} />)}</div>}
        {e.related.sameType.length > 0 && <div className="mt-2 space-y-2">{e.related.sameType.slice(0, 3).map((r) => <Related key={r.id} label="Same kind" e={r} />)}</div>}
      </Section>

      <IWasHere subject={`event:${e.id}`} />
      <Discussion subject={`event:${e.id}`} />
    </article>
  );
}

export function BlockView({ height }: { height: string }) {
  const { data: b, error, loading, reload } = useApi<BlockDetail>(`/blocks/${encodeURIComponent(height)}`);
  const setHighlight = useWorld((s) => s.setHighlightBlock);
  useEffect(() => {
    setHighlight(height);
    return () => setHighlight(null);
  }, [height, setHighlight]);
  if (loading && !b) return <Loading />;
  if (error || !b) return <ErrorNote retry={reload}>{error ?? "That block isn't in the archive."}</ErrorNote>;
  const s = b.settlement;
  return (
    <article>
      <Heading eyebrow="The Block Vault" title={`Squeek block ${formatInt(b.height)}`} />
      <div className="flex flex-wrap items-center gap-2 -mt-2 mb-3"><ProofBadge kind="chain" /><Time at={b.completedAt} /></div>
      <p className="text-sm text-gray">{b.note} A Squeek block isn't an Ethereum block: it's one billion block units of earned progress.</p>
      <ShareBar path={`/block/${b.height}`} subject={`block:${b.height}`} text={`Squeek block ${b.height}, on the Squeek Time Machine.`} />
      <Section title="Settlement">
        <Facts rows={[
          ["Transaction", <TxLink key="t" hash={s.transactionHash} />],
          ["Ethereum block", formatInt(s.ethereumBlockNumber)],
          ["Rounds", `${s.previousRound} → ${s.settledThroughRound}`],
          ["Completed together", `${formatInt(s.completedBlockCount)} blocks (${s.firstCompletedBlock}–${s.lastCompletedBlock})`],
          ["Work total", formatInt(s.cumulativeWork)],
          ["Status", s.confirmationStatus],
          ["Installation", <span key="i" className="font-data text-xs break-all">{b.installationId}</span>],
        ]} />
      </Section>
      {b.event && <Section title="On the timeline"><PanelLink to={{ kind: "event", id: b.event.id }}>{b.event.title}</PanelLink></Section>}
      <div className="flex gap-2 mt-4">
        {b.previous && <PanelLink className="btn" to={{ kind: "block", height: b.previous }}>← {b.previous}</PanelLink>}
        {b.next && <PanelLink className="btn" to={{ kind: "block", height: b.next }}>{b.next} →</PanelLink>}
      </div>
      <IWasHere subject={`block:${b.height}`} />
      <Discussion subject={`block:${b.height}`} />
    </article>
  );
}

export function TimelinePanel() {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"desc" | "asc">("desc");
  const [importantOnly, setImportantOnly] = useState(true);
  const [rows, setRows] = useState<EventSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const bump = useWorld((s) => s.eventBump);

  const load = async (after: string | null) => {
    const p = new URLSearchParams({ limit: "30", direction });
    if (category) p.set("category", category);
    if (query) p.set("q", query);
    if (importantOnly && !category && !query) p.set("minSignificance", "2");
    if (after) p.set("cursor", after);
    setState("loading");
    try {
      const r = await api<{ events: EventSummary[]; nextCursor: string | null }>(`/events?${p}`);
      setRows((old) => (after ? [...old, ...r.events] : r.events));
      setCursor(r.nextCursor);
      setState("ready");
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    void load(null);
  }, [category, query, direction, importantOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bump && direction === "desc" && !query) void load(null);
  }, [bump]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Heading eyebrow="Room 2" title="The Timeline" sub="Every record comes from the official feed or the contract's own logs. Nothing here is written by hand except clearly marked archive notes." />
      <form className="flex gap-2 mb-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <label className="sr-only" htmlFor="tl-q">Search history</label>
        <input id="tl-q" className="field" placeholder="Search events, Squeek numbers, hashes" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Filter by category">
        <button aria-pressed={!category} className={`btn ${!category ? "border-gold text-gold" : ""}`} onClick={() => setCategory("")}>All</button>
        {CATEGORIES.filter((c) => c.slug !== "other").map((c) => <button key={c.slug} aria-pressed={category === c.slug} className={`btn ${category === c.slug ? "border-gold text-gold" : ""}`} onClick={() => setCategory(c.slug)}>{c.label}</button>)}
      </div>
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <button className="btn" onClick={() => setDirection(direction === "desc" ? "asc" : "desc")}>{direction === "desc" ? "Newest first ↓ travel back" : "Oldest first ↑ travel forward"}</button>
        {!category && !query && <label className="flex items-center gap-2 text-xs text-dim"><input type="checkbox" checked={!importantOnly} onChange={(e) => setImportantOnly(!e.target.checked)} /> Include quiet settlements and small moves</label>}
      </div>
      {state === "error" && !rows.length ? <ErrorNote retry={() => load(null)}>The timeline can't be reached right now.</ErrorNote> : (
        <div className="space-y-2">{rows.map((e) => <EventRow key={e.id} e={e} />)}</div>
      )}
      {state === "loading" && <Loading />}
      {state === "ready" && !rows.length && <Empty>Nothing matches that yet.</Empty>}
      {cursor && state !== "loading" && <button className="btn w-full mt-3" onClick={() => load(cursor)}>Keep travelling</button>}
    </div>
  );
}

export function VaultPanel() {
  const bump = useWorld((s) => s.blockBump);
  const open = useWorld((s) => s.openPanel);
  const [q, setQ] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<{ installationId: string | null; total: number; blocks: BlockSummary[]; nextBefore: string | null }>("/blocks?limit=60", [bump]);
  const { data: settlements } = useApi<SettlementRow[]>("/settlements?limit=8", [bump]);
  return (
    <div>
      <Heading eyebrow="Room 4" title="The Block Vault" sub={data ? `${formatInt(data.total)} Squeek blocks on the shelf in this installation. Each one is a real completed block, and the shelf grows when a new settlement lands.` : "Every completed Squeek block, kept where you can pick it up."} />
      <form className="flex gap-2 mb-3" onSubmit={(e) => {
        e.preventDefault();
        setNote(null);
        const h = q.trim();
        if (!/^\d+$/.test(h)) return setNote("Enter a block height, like 250.");
        open({ kind: "block", height: h });
      }}>
        <label className="sr-only" htmlFor="v-q">Block height</label>
        <input id="v-q" inputMode="numeric" className="field" placeholder="Search by block height" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Find</button>
      </form>
      {note && <p role="alert" className="text-sm text-rose mb-2">{note}</p>}
      {loading && !data ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <>
          {!data?.blocks.length && <Empty>No blocks are in the archive yet.</Empty>}
          <ul className="grid grid-cols-5 sm:grid-cols-6 gap-1" aria-label="Most recent blocks">
            {data?.blocks.map((b) => (
              <li key={b.height}><button className="w-full card py-2 font-data text-xs text-mint hover:border-mint" aria-label={`Block ${b.height}`} onClick={() => open({ kind: "block", height: b.height })}>{b.height}</button></li>
            ))}
          </ul>
        </>
      )}
      <Section title="Recent settlements">
        {settlements?.length ? (
          <ul className="space-y-1">{settlements.map((s) => (
            <li key={s.id} className="card p-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-dim">Round {s.settledThroughRound}: {s.completedBlockCount === "0" ? "no blocks" : `${s.completedBlockCount} blocks`}</span>
              <span className="flex items-center gap-2"><Time at={s.occurredAt} /><TxLink hash={s.transactionHash} /></span>
            </li>
          ))}</ul>
        ) : <Empty>No settlements yet.</Empty>}
      </Section>
    </div>
  );
}
