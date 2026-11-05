"use client";
import { BRAND, VERIFICATION_LABEL, formatInt, formatSqk, mmPerSecToKmh, mmToKm, rpmFromMilli, type Verification } from "@stm/shared";
import { useState } from "react";
import { api, subjectHref, useApi, type FeedRow, type Memory, type MilestoneRow, type OriginArtifact, type PollRow } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { useLoadMe, useMe } from "./account";
import { BarChart, LineChart, type Point } from "./charts";
import { MemoryCard } from "./discussion";
import { EventRow } from "./records";
import { CopyButton, Empty, ErrorNote, Heading, Loading, PanelLink, ProofBadge, Section, Stat, Time } from "./ui";

export function BeginningPanel() {
  const { data, error, loading, reload } = useApi<{ artifacts: OriginArtifact[] }>("/origin");
  const { data: notes } = useApi<{ events: { id: string; title: string; summary: string; occurredAt: string; provisional: boolean; sourceKind: string }[] }>("/events?category=archive&direction=asc&limit=10");
  const open = useWorld((s) => s.openPanel);
  return (
    <div>
      <Heading eyebrow="Room 1" title="The Beginning" sub="A hamster, a wheel with a magnet on it, and Ethereum. Everything here comes from the official docs, with the page it came from." />
      {loading && !data ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <div className="grid sm:grid-cols-2 gap-2">{data?.artifacts.map((a) => (
          <button key={a.slug} className="card p-3 text-left hover:border-gold" onClick={() => open({ kind: "artifact", slug: a.slug })}>
            <span className="title text-xl text-gold block">{a.title}</span>
            <span className="text-sm text-dim line-clamp-2">{a.body}</span>
          </button>
        ))}</div>
      )}
      <Section title="How the record has changed">
        <p className="text-sm text-gray mb-2">Squeekchain is still on testnet, and each release can start a new reporting history. These notes keep the earlier numbers from disappearing.</p>
        <div className="space-y-2">{notes?.events.map((e) => <EventRow key={e.id} e={e} />)}</div>
      </Section>
    </div>
  );
}

export function ArtifactView({ slug }: { slug: string }) {
  const { data, loading } = useApi<{ artifacts: OriginArtifact[] }>("/origin");
  const a = data?.artifacts.find((x) => x.slug === slug);
  if (loading && !a) return <Loading />;
  if (!a) return <ErrorNote>That artifact isn't here.</ErrorNote>;
  return (
    <article>
      <Heading eyebrow="The Beginning" title={a.title} />
      <ProofBadge kind="archive" />
      <p className="text-ink mt-3 leading-relaxed">{a.body}</p>
      <p className="mt-4"><a className="text-sky underline underline-offset-2 text-sm break-all" href={a.source} target="_blank" rel="noopener noreferrer nofollow">Read it in the official docs ↗</a></p>
    </article>
  );
}

interface WheelData {
  provenance: string;
  stats: { lifetime?: { observedDistanceMm: string; acceptedWorkUnits: string; activeDayCount: number; firstObservedAt?: string }; records?: Record<string, { value: string; occurredAt: string; coverage: string }>; rounds?: { activeCount?: number; observedCount?: number; zeroWorkCount?: number; medianActiveWork?: string; activeRateBps?: number } | null; typicalDay?: { startMinuteUtc: number; meanWorkMilli: string; observedDayCount: number }[] } | null;
  statsFetchedAt: string | null;
  runs: { freshness?: string; items: { segmentId: string; startAt: string; endAt: string; workUnits: string; provenance?: string }[] } | null;
  days: { date: string; distanceMm: string | null; workUnits: string | null; coverageBps: number; buckets: { startMinuteUtc: number; workUnits?: string | null; distanceMm?: string | null; coverage?: string }[] }[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function dayPoints(d: WheelData["days"][number]): Point[] {
  return d.buckets.map((b) => {
    const v = b.workUnits === null || b.workUnits === undefined || b.coverage === "none" ? null : Number(b.workUnits);
    return { label: hhmm(b.startMinuteUtc), value: v, display: v === null ? "no reading" : `${formatInt(b.workUnits as string)} work` };
  });
}

export function WheelPanel() {
  const live = useWorld((s) => s.live);
  const { data, error, loading, reload } = useApi<WheelData>("/wheel");
  const days = data?.days ?? [];
  const shared = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const [a, setA] = useState<string | null>(shared?.get("dayA") ?? null);
  const [b, setB] = useState<string | null>(shared?.get("dayB") ?? null);
  const dayA = days.find((d) => d.date === a) ?? days[0];
  const dayB = days.find((d) => d.date === b && d.date !== dayA?.date);
  const r = data?.stats?.records;
  const lifetime = data?.stats?.lifetime;
  const running = (live?.rpmMilli ?? 0) > 0;
  return (
    <div>
      <Heading eyebrow="Room 3" title="The Wheel Room" sub={data?.provenance ?? "Wheel figures are device measurements. Only settled work is certified on Ethereum."} />
      <div className="card p-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label">Right now</p>
          <p className="title text-3xl text-ink">{live ? (running ? `Running at ${rpmFromMilli(live.rpmMilli!)} RPM` : "The wheel is still") : "Unknown"}</p>
          {live?.observedAt && <p className="text-xs text-gray font-data mt-1">{live.freshness} · measured {new Date(live.observedAt).toISOString().slice(11, 19)} UTC</p>}
        </div>
        <ProofBadge kind="measured" />
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Lifetime distance" value={lifetime ? `${mmToKm(lifetime.observedDistanceMm)} km` : "Unknown"} note="This installation" />
            <Stat label="Accepted work" value={lifetime ? formatInt(lifetime.acceptedWorkUnits) : "Unknown"} />
            <Stat label="Top speed" value={r?.peakObservedSpeedMmPerSecond ? `${mmPerSecToKmh(Number(r.peakObservedSpeedMmPerSecond.value))} km/h` : "Unknown"} />
            <Stat label="Peak wheel" value={r?.peakObservedRpmMilli ? `${rpmFromMilli(Number(r.peakObservedRpmMilli.value))} RPM` : "Unknown"} />
            <Stat label="Best half hour" value={r?.mostWorkHalfHour ? `${formatInt(r.mostWorkHalfHour.value)} work` : "Unknown"} />
            <Stat label="Rounds with running" value={data?.stats?.rounds?.observedCount ? `${data.stats.rounds.activeCount} of ${data.stats.rounds.observedCount}` : "Unknown"} note="He runs when he wants to" />
          </div>
          <Section title="Compare two days">
            {!days.length ? <Empty>No daily readings yet.</Empty> : (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  <label className="text-xs text-dim flex items-center gap-1">Day <select className="field py-1 w-auto" value={dayA?.date ?? ""} onChange={(e) => setA(e.target.value)}>{days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
                  <label className="text-xs text-dim flex items-center gap-1">Against <select className="field py-1 w-auto" value={b ?? ""} onChange={(e) => setB(e.target.value || null)}><option value="">none</option>{days.filter((d) => d.date !== dayA?.date).map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
                </div>
                {dayA && dayB && <div className="mb-2"><CopyButton getText={() => `${window.location.origin}/archive?room=wheel&dayA=${dayA.date}&dayB=${dayB.date}`} /></div>}
                {dayA && <LineChart title="Work per half hour" unit="UTC" series={[{ name: dayA.date, color: "#c47d10", points: dayPoints(dayA) }, ...(dayB ? [{ name: dayB.date, color: BRAND.blue, points: dayPoints(dayB) }] : [])]} />}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[dayA, dayB].filter(Boolean).map((d) => <Stat key={d!.date} label={d!.date} value={d!.distanceMm === null ? "No reading" : `${mmToKm(d!.distanceMm)} km`} note={`${(d!.coverageBps / 100).toFixed(0)}% of rounds observed`} />)}
                </div>
              </>
            )}
          </Section>
          <Section title="Daily distance">
            <BarChart title="Distance by measurement day" unit="km" points={[...days].reverse().map((d) => ({ label: d.date.slice(5), value: d.distanceMm === null ? null : Number(d.distanceMm) / 1e6, display: d.distanceMm === null ? "no reading" : `${mmToKm(d.distanceMm)} km` }))} onSelect={(i) => setA([...days].reverse()[i].date)} />
          </Section>
          <Section title="Recent runs">
            {data?.runs?.items.length ? (
              <ul className="space-y-1">{data.runs.items.slice(0, 8).map((x) => <li key={x.segmentId} className="flex flex-wrap items-center justify-between gap-2 card p-2 text-sm"><span className="text-dim">{formatInt(x.workUnits)} work</span><Time at={x.startAt} /></li>)}</ul>
            ) : <Empty>No recent runs were reported.</Empty>}
            <p className="text-xs text-gray mt-2">Runs are device records and aren't certified.</p>
          </Section>
        </>
      )}
    </div>
  );
}

interface Evolution {
  installationId: string | null;
  installations: { id: string; releaseId: string | null; lastTotals: { blockHeight?: string; cumulativeWork?: string } | null }[];
  mining: { capturedAt: string; blockHeight: string; cumulativeWork: string; workPerThousandBlocks: number; settledThroughRound: string; mintedBaseUnits: string | null; stakedBaseUnits: string | null; nftLive: number | null; nftBurned: number | null }[];
  merges: number;
  economy: { supply?: { capBaseUnits: string; miningMintedBaseUnits: string; premintBaseUnits?: string }; schedule?: { bonusBlocks: string; halvingBlocks: string }; staking?: { totalStakedBaseUnits: string } | null; nft?: { live: string; burned: string; basePower?: string[]; cooldownBlocks?: string[]; issued: string } } | null;
  economyFetchedAt: string | null;
}

export function EvolutionPanel() {
  const bump = useWorld((s) => s.blockBump);
  const { data, error, loading, reload } = useApi<Evolution>("/evolution", [bump]);
  const { data: ms } = useApi<MilestoneRow[]>("/milestones", [bump]);
  const m = data?.mining ?? [];
  const label = (r: Evolution["mining"][number]) => `Round ${r.settledThroughRound}`;
  const issued = data?.economy?.supply ? `${formatSqk(data.economy.supply.miningMintedBaseUnits, 0)} SQK` : "Unknown";
  return (
    <div>
      <Heading eyebrow="Room 5" title="The Evolution Room" sub="How the work, the difficulty and the supply changed, from the contract's own records." />
      {loading && !data ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Issued by mining" value={issued} />
            <Stat label="Total staked" value={data?.economy?.staking ? `${formatSqk(data.economy.staking.totalStakedBaseUnits, 0)} SQK` : "Unknown"} />
            <Stat label="Squeeks alive" value={data?.economy?.nft ? formatInt(data.economy.nft.live) : "Unknown"} note={data?.economy?.nft ? `${formatInt(data.economy.nft.burned)} burned by merging` : undefined} />
            <Stat label="Merges in the archive" value={formatInt(data?.merges ?? 0)} />
          </div>
          <Section title="Difficulty">
            <LineChart title="Work needed for 1,000 Squeek blocks" series={[{ name: "Difficulty", color: "#c47d10", points: m.map((r) => ({ label: label(r), value: r.workPerThousandBlocks, display: formatInt(r.workPerThousandBlocks) })) }]} />
            <p className="text-xs text-gray mt-1">Difficulty adapts to the hamster's active rounds. It doesn't follow elapsed time.</p>
          </Section>
          <Section title="Block height">
            <LineChart title="Settled Squeek blocks" series={[{ name: "Height", color: BRAND.green, points: m.map((r) => ({ label: label(r), value: Number(r.blockHeight), display: formatInt(r.blockHeight) })) }]} />
          </Section>
          <Section title="Installations">
            <p className="text-sm text-gray mb-2">A new release can reset the counters. They're kept apart here, so they don't read as one history.</p>
            <ul className="space-y-1">{data?.installations.map((i) => (
              <li key={i.id} className="card p-2 text-sm"><span className="font-data text-xs text-dim break-all">{i.id}</span>{i.id === data.installationId && <span className="label ml-2 text-mint">current</span>}</li>
            ))}</ul>
          </Section>
          <Section title="Milestones">
            {ms?.length ? <ul className="space-y-1">{ms.slice(0, 14).map((x) => (
              <li key={x.key} className="card p-2">
                {x.eventId ? <PanelLink to={{ kind: "event", id: x.eventId }} className="text-left text-sm text-ink hover:text-gold">{x.title}</PanelLink> : <span className="text-sm text-ink">{x.title}</span>}
                <div><Time at={x.achievedAt} /></div>
              </li>
            ))}</ul> : <Empty>No milestones yet.</Empty>}
          </Section>
        </>
      )}
    </div>
  );
}

export function PollCard({ poll, onChange }: { poll: PollRow; onChange: () => void }) {
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const [note, setNote] = useState<string | null>(null);
  const total = poll.options.reduce((a, o) => a + o.votes, 0);
  const voted = poll.myVote !== null;
  return (
    <article className="card p-3">
      <h4 className="text-ink text-sm font-semibold">{poll.question}</h4>
      <p className="label mt-0.5">by {poll.username} · {total} vote{total === 1 ? "" : "s"}</p>
      <ul className="mt-2 space-y-1">{poll.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <li key={o.id}>
            <button disabled={voted} onClick={async () => {
              if (!me) return open({ kind: "account" });
              try {
                await api(`/community/polls/${poll.id}/vote`, { method: "POST", body: { optionId: o.id } });
                onChange();
              } catch (e) {
                setNote((e as Error).message);
              }
            }} className={`relative w-full text-left border px-2 py-1.5 text-sm overflow-hidden ${poll.myVote === o.id ? "border-gold" : "border-line"} ${voted ? "" : "hover:border-gold"}`}>
              {voted && <span aria-hidden className="absolute inset-y-0 left-0 bg-gold/20" style={{ width: `${pct}%` }} />}
              <span className="relative flex justify-between gap-2"><span className="text-ink">{o.label}</span>{voted && <span className="font-data text-xs text-dim">{pct}%</span>}</span>
            </button>
          </li>
        );
      })}</ul>
      {note && <p role="alert" className="text-xs text-rose mt-1">{note}</p>}
    </article>
  );
}

function PollComposer({ scope, onDone }: { scope: "general" | "future"; onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [note, setNote] = useState<string | null>(null);
  return (
    <form className="card p-3 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setNote(null);
      try {
        await api("/community/polls", { method: "POST", body: { question, options: options.map((o) => o.trim()).filter(Boolean), scope } });
        setQuestion("");
        setOptions(["", ""]);
        onDone();
      } catch (err) {
        setNote((err as Error).message);
      }
    }}>
      <label className="block"><span className="label">Ask something</span><input className="field mt-1" value={question} maxLength={160} onChange={(e) => setQuestion(e.target.value)} /></label>
      {options.map((o, i) => <input key={i} aria-label={`Option ${i + 1}`} className="field" placeholder={`Option ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />)}
      {note && <p role="alert" className="text-xs text-rose">{note}</p>}
      <div className="flex gap-2">
        {options.length < 6 && <button type="button" className="btn" onClick={() => setOptions([...options, ""])}>Add option</button>}
        <button className="btn btn-gold" disabled={!question.trim()}>Create poll</button>
      </div>
    </form>
  );
}

interface Discovery { mostDiscussed: { id: string; title: string; occurredAt: string; count: number }[]; mostRemembered: { id: string; title: string; occurredAt: string; count: number }[]; popularMemories: (Memory & { count: number })[]; recentMemories: Memory[] }

export function CommunityPanel() {
  useLoadMe();
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.memoryBump);
  const { data: disc, error, loading, reload } = useApi<Discovery>("/community/discovery", [bump]);
  const { data: feed } = useApi<FeedRow[]>("/community/feed", [bump]);
  const polls = useApi<PollRow[]>("/community/polls?scope=general", [bump]);
  return (
    <div>
      <Heading eyebrow="Room 6" title="The Community Archive" sub="This is where visitors become part of the history. Everything in this room is written by people, and it's kept apart from the official records." />
      <div className="card p-3 mb-3">
        <p className="title text-2xl text-gold uppercase tracking-wide">I was here</p>
        <p className="text-sm text-dim mt-1">Open any moment on the Timeline or any block in the Vault, and attach your own memory to it.</p>
        <div className="flex gap-2 mt-2">
          <button className="btn" onClick={() => open({ kind: "room", room: "timeline" })}>Find a moment</button>
          {!me && <button className="btn" onClick={() => open({ kind: "account" })}>Sign in</button>}
        </div>
      </div>
      {loading && !disc ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <>
          <Section title="Recent memories">
            {disc?.recentMemories.length ? <div className="space-y-2">{disc.recentMemories.map((m) => (
              <MemoryCard key={m.id} m={m}>{subjectHref(m.subject) && <a href={subjectHref(m.subject)!} className="block mt-2 text-xs text-sky underline underline-offset-2">Go to this moment</a>}</MemoryCard>
            ))}</div> : <Empty>The wall is empty. Be the first to leave something on it.</Empty>}
          </Section>
          {!!disc?.popularMemories.length && <Section title="Most loved memories"><div className="space-y-2">{disc.popularMemories.map((m) => <MemoryCard key={m.id} m={m} />)}</div></Section>}
          {!!disc?.mostRemembered.length && <Section title="Most remembered moments"><div className="space-y-2">{disc.mostRemembered.map((e) => <EventRow key={e.id} compact e={{ ...e, provisional: false, comments: e.count }} />)}</div></Section>}
          {!!disc?.mostDiscussed.length && <Section title="Most discussed"><div className="space-y-2">{disc.mostDiscussed.map((e) => <EventRow key={e.id} compact e={{ ...e, provisional: false, comments: e.count }} />)}</div></Section>}
        </>
      )}
      <Section title="Polls">
        <div className="space-y-2">
          {me && <PollComposer scope="general" onDone={polls.reload} />}
          {polls.data?.length ? polls.data.map((p) => <PollCard key={p.id} poll={p} onChange={polls.reload} />) : <Empty>No polls yet.</Empty>}
        </div>
      </Section>
      <Section title="Latest activity">
        {feed?.length ? (
          <ul className="space-y-1">{feed.map((f) => (
            <li key={f.id} className="text-sm text-dim border-t border-line py-1.5 pre-wrap">
              <button className="font-data text-xs text-amber hover:underline mr-1" onClick={() => open({ kind: "user", username: f.username })}>{f.username}</button>
              {f.kind === "memory" ? "left a memory" : f.kind === "comment" ? "commented" : "started a poll"}{f.excerpt ? `: ${f.excerpt}` : ""}
            </li>
          ))}</ul>
        ) : <Empty>Nothing yet.</Empty>}
      </Section>
    </div>
  );
}

interface FutureData {
  notes: { verification: Verification; title: string; body: string; source: string }[];
  locks: { key: string; title: string; detail: string; verification: Verification; target: string; current: string | null; unit: string }[];
}

const VERIFY_STYLE: Record<Verification, string> = { verified: "border-mint/50 text-mint", official: "border-sky/50 text-sky", community: "border-rose/50 text-rose", unconfirmed: "border-amber/50 text-amber" };
export const VerifyTag = ({ v }: { v: Verification }) => <span className={`inline-block border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wider ${VERIFY_STYLE[v]}`}>{VERIFICATION_LABEL[v]}</span>;

export function FuturePanel() {
  useLoadMe();
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.memoryBump);
  const { data, error, loading, reload } = useApi<FutureData>("/future", [useWorld((s) => s.blockBump)]);
  const predictions = useApi<Memory[]>("/community/memories?kind=expectation&limit=20", [bump]);
  const polls = useApi<PollRow[]>("/community/polls?scope=future", [bump]);
  const [body, setBody] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <Heading eyebrow="Room 7" title="The Future" sub="Sealed doors for what hasn't happened yet. Every item says how much we actually know." />
      {loading && !data ? <Loading /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : (
        <>
          <Section title="Locked discoveries">
            {data?.locks.length ? <ul className="space-y-2">{data.locks.map((l) => {
              const pct = l.current ? Math.min(100, Number((BigInt(l.current) * 10000n) / BigInt(l.target)) / 100) : 0;
              return (
                <li key={l.key} className="card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="title text-xl text-cream">🔒 {l.title}</span><VerifyTag v={l.verification} /></div>
                  <p className="text-sm text-dim mt-1">{l.detail}</p>
                  <div className="h-1 bg-line mt-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${l.title}`}><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
                  <p className="label mt-1">{pct.toFixed(1)}%</p>
                </li>
              );
            })}</ul> : <Empty>The next thresholds can't be worked out until the live data is back.</Empty>}
          </Section>
          <Section title="What the docs say">
            <ul className="space-y-2">{data?.notes.map((n) => (
              <li key={n.title} className="card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-ink font-semibold text-sm">{n.title}</span><VerifyTag v={n.verification} /></div>
                <p className="text-sm text-dim mt-1">{n.body}</p>
                <a className="text-xs text-sky underline underline-offset-2" href={n.source} target="_blank" rel="noopener noreferrer nofollow">Source ↗</a>
              </li>
            ))}</ul>
          </Section>
        </>
      )}
      <Section title="Community predictions" action={<VerifyTag v="community" />}>
        <p className="text-sm text-gray mb-2">These are guesses from visitors. They're not announcements, and nobody here speaks for the team.</p>
        {me ? (
          <form className="space-y-2 mb-3" onSubmit={async (e) => {
            e.preventDefault();
            setNote(null);
            try {
              await api("/community/memories", { method: "POST", body: { kind: "expectation", body } });
              setBody("");
              await predictions.reload();
            } catch (err) {
              setNote((err as Error).message);
            }
          }}>
            <label className="sr-only" htmlFor="pred">Your prediction</label>
            <textarea id="pred" className="field min-h-16" maxLength={400} value={body} onChange={(e) => setBody(e.target.value)} placeholder="I think that…" />
            {note && <p role="alert" className="text-xs text-rose">{note}</p>}
            <button className="btn btn-gold" disabled={!body.trim()}>Add my prediction</button>
          </form>
        ) : <button className="btn w-full mb-3" onClick={() => open({ kind: "account" })}>Sign in to add a prediction</button>}
        {predictions.data?.length ? <div className="space-y-2">{predictions.data.map((m) => <MemoryCard key={m.id} m={m} />)}</div> : <Empty>No predictions yet.</Empty>}
      </Section>
      <Section title="Polls about what's next">
        <div className="space-y-2">
          {me && <PollComposer scope="future" onDone={polls.reload} />}
          {polls.data?.length ? polls.data.map((p) => <PollCard key={p.id} poll={p} onChange={polls.reload} />) : <Empty>No polls yet.</Empty>}
        </div>
      </Section>
    </div>
  );
}

export function UserPanel({ username }: { username: string }) {
  const { data, error, loading, reload } = useApi<{ username: string; wallet: string | null; bio: string; joinedAt: string; contributions: { id: string; kind: string; subject: string; excerpt: string | null; createdAt: string }[]; totals: Record<string, number> }>(`/users/${encodeURIComponent(username)}`);
  const me = useMe((s) => s.me);
  const [bio, setBio] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorNote retry={reload}>{error ?? "No such user."}</ErrorNote>;
  return (
    <div>
      <Heading eyebrow="Community member" title={data.username} sub={data.bio || undefined} />
      <div className="flex flex-wrap gap-3 text-xs text-gray font-data mb-3">
        <span>Joined {data.joinedAt.slice(0, 10)}</span>
        {Object.entries(data.totals).map(([k, v]) => <span key={k}>{v} {k}{v === 1 ? "" : "s"}</span>)}
      </div>
      {me?.username === data.username && (
        <form className="card p-3 space-y-2 mb-3" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/users/me/profile", { method: "PUT", body: { bio: bio ?? data.bio } });
            setNote("Saved.");
            await reload();
          } catch (err) {
            setNote((err as Error).message);
          }
        }}>
          <label className="block"><span className="label">About you</span><input className="field mt-1" maxLength={240} value={bio ?? data.bio} onChange={(e) => setBio(e.target.value)} /></label>
          <button className="btn">Save</button>
          {note && <p role="status" className="text-xs text-dim">{note}</p>}
        </form>
      )}
      <Section title="Contributions">
        {data.contributions.length ? <ul className="space-y-1">{data.contributions.map((c) => {
          const href = subjectHref(c.subject);
          return (
            <li key={c.id} className="card p-2 text-sm text-dim pre-wrap">
              <span className="label mr-2">{c.kind}</span>{c.excerpt}
              <div className="flex items-center gap-2 mt-1"><Time at={c.createdAt} />{href && <a href={href} className="text-xs text-sky underline underline-offset-2">Open</a>}</div>
            </li>
          );
        })}</ul> : <Empty>Nothing yet.</Empty>}
      </Section>
    </div>
  );
}

export function SearchPanel() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, loading, error } = useApi<{ events: { id: string; title: string; occurredAt: string; provisional: boolean }[]; block: { height: string; completedAt: string } | null; milestones: MilestoneRow[] }>(term ? `/search?q=${encodeURIComponent(term)}` : null);
  return (
    <div>
      <Heading eyebrow="Search" title="Find a moment" />
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <label className="sr-only" htmlFor="s-q">Search</label>
        <input id="s-q" autoFocus className="field" placeholder="A block height, a Squeek number, a transaction hash, a word" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Search</button>
      </form>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <div className="mt-3 space-y-2">
          {data.block && <PanelLink className="card p-3 block w-full text-left hover:border-gold" to={{ kind: "block", height: data.block.height }}><span className="title text-xl text-mint">Squeek block {data.block.height}</span></PanelLink>}
          {data.events.map((e) => <EventRow key={e.id} compact e={e} />)}
          {!data.block && !data.events.length && <Empty>Nothing matches that.</Empty>}
        </div>
      )}
    </div>
  );
}
