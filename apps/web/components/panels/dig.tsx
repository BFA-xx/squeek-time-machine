"use client";
import { BANDS, CREWS, formatInt, formatUtc, type BandSlug, type CrewSlug } from "@stm/shared";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { net, refreshMultiplayer } from "@/lib/multiplayer";
import { useWorld } from "@/lib/store";
import { useLoadMe, useMe } from "./account";
import { Empty, ErrorNote, Heading, Loading, ProofBadge, Section, Stat, Time, TxLink } from "./ui";

export interface DigState {
  status: "available" | "unavailable";
  reason?: string;
  round: string;
  frontier: string;
  work: string;
  chamber: { number: number; from: string; target: string; progressBps: number };
  shift: {
    open: { index: number; startsAt: string; endsAt: string; locksAt: string; calls: number; startRound: string; endRound: string };
    running: { index: number; startsAt: string; endsAt: string; picks: Record<BandSlug, number> };
  };
  results: { index: number; band: BandSlug; workUnits: string; settledAt: string; transactionHash: string | null; picks: Record<BandSlug, number> }[];
  chambers: { number: number; target: string; brokeAt: string; transactionHash: string; crew: CrewSlug | null }[];
  crews: { slug: CrewSlug; name: string; color: string; motto: string; points: number; members: number; chambers: number }[];
  leaderboard: { username: string; displayName: string | null; points: number; wins: number; crew: CrewSlug | null; squeekId: string | null; squeekLevel: number | null }[];
  contributions?: { txHash: string; kind: string; points: number; username: string; displayName: string | null }[];
  me: { tasks?: { slug: string; name: string; how: string; points: number; claimed: boolean; ready: boolean; room: boolean }[]; taskPoints: number; crew: CrewSlug | null; squeekId: string | null; squeekLevel: number | null; openCall: BandSlug | null; points: number; wins: number; played: number; streak: number; recent: { shiftIndex: number; band: BandSlug; correct: boolean | null; points: number | null }[] } | null;
}

const bandName = (b: string) => BANDS.find((x) => x.slug === b)?.name ?? b;
const crewOf = (c: string | null) => CREWS.find((x) => x.slug === c);

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(0, Math.round((new Date(to).getTime() - now) / 60_000));
  return <>{mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}</>;
}

function Squeeks({ current, onDone }: { current: string | null; onDone: () => void }) {
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const { data, error, loading } = useApi<{ wallet: string | null; squeeks: { tokenId: string; level: number }[] }>(me ? "/dig/squeeks" : null);
  const [note, setNote] = useState<string | null>(null);
  const pick = async (tokenId: string | null) => {
    setNote(null);
    try {
      await api("/dig/squeek", { method: "POST", body: { tokenId } });
      onDone();
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  return (
    <Section title="Bring your Squeek">
      <p className="text-sm text-gray mb-2">Your Squeek appears next to your name, with its level as stars on your hamster. It's only for show, and it earns no extra points.</p>
      {loading ? <Loading label="Checking your wallet…" /> : error ? <ErrorNote>{error}</ErrorNote> : !data?.wallet ? (
        <button className="btn" onClick={() => open({ kind: "account" })}>Link the wallet that holds your Squeek</button>
      ) : !data.squeeks.length ? <Empty>This wallet doesn't hold any Squeeks in the current release.</Empty> : (
        <div className="flex flex-wrap gap-1">
          {data.squeeks.slice(0, 24).map((s) => <button key={s.tokenId} aria-pressed={current === s.tokenId} className={`btn ${current === s.tokenId ? "border-gold text-gold" : ""}`} onClick={() => pick(s.tokenId)}>#{s.tokenId} · Lv {s.level}</button>)}
          {current && <button className="btn" onClick={() => pick(null)}>Hide</button>}
        </div>
      )}
      {note && <p role="alert" className="text-sm text-rose mt-2">{note}</p>}
    </Section>
  );
}

export function DigPanel({ focus }: { focus?: "call" | "crew" }) {
  useLoadMe();
  const user = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const digBump = useWorld((s) => s.digBump);
  const bump = useWorld((s) => s.bumpDig);
  const { data, error, loading, reload } = useApi<DigState>("/dig", [digBump, user?.id]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (focus && data) document.getElementById(`dig-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, body: unknown) => {
    if (!user) return open({ kind: "account" });
    setBusy(true);
    setNote(null);
    try {
      await api(path, { method: "POST", body });
      await reload();
      if (path === "/dig/crew") refreshMultiplayer();
      bump();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading label="Lowering the lantern…" />;
  if (error) return <ErrorNote retry={reload}>{error}</ErrorNote>;
  if (!data || data.status !== "available") return <ErrorNote retry={reload}>{data?.reason ?? "The dig can't start until the live data is back."}</ErrorNote>;
  const me = data.me;
  const progress = data.chamber.progressBps / 100;
  const running = data.shift.running;
  const runningTotal = Object.values(running.picks).reduce((a, b) => a + b, 0);
  return (
    <div>
      <Heading eyebrow="The game" title="The Great Dig" sub="Every step Squeektoshi takes digs the burrow deeper. Join a crew and call what he'll do next. Real settled rounds decide who was right." />
      <p className="text-xs text-gray -mt-2 mb-3">Free to play. Points have no value and can't be bought, sold or spent. Nobody here can make him run, and his care policy says nobody should.</p>

      <section aria-label="Current chamber" className="card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="title text-2xl text-[#ff8a3d]">Chamber {formatInt(data.chamber.number)}</span><ProofBadge kind="chain" /></div>
        <div className="h-2 bg-line mt-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress through chamber ${data.chamber.number}`}><div className="h-full bg-[#ff8a3d]" style={{ width: `${progress}%` }} /></div>
        <p className="text-xs text-dim mt-1 font-data">{formatInt(data.work)} of {formatInt(data.chamber.target)} settled work</p>
      </section>

      {me?.crew && !!me.tasks?.length && (
        <section aria-label="Today's tasks" className="mt-5">
          <h3 className="label mb-2">Today's tasks · new ones at 00:00 UTC</h3>
          <ul className="space-y-1.5">
            {me.tasks.map((t) => {
              const proof = t.room ? net.proofs[t.slug] : undefined;
              const canClaim = !t.claimed && (t.ready || !!proof);
              return (
                <li key={t.slug} className="card p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm ${t.claimed ? "text-mint" : "text-ink"}`}>{t.claimed ? "Done: " : ""}{t.name}</p>
                    {!t.claimed && <p className="text-xs text-gray">{t.how}</p>}
                  </div>
                  {canClaim
                    ? <button className="btn btn-gold shrink-0" disabled={busy} onClick={() => act(`/dig/tasks/${t.slug}`, { proof })}>Claim +{t.points}</button>
                    : <span className="font-data text-xs text-dim shrink-0">+{t.points}</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray mt-1">The server checks each task itself. Wheel and hello tasks are confirmed by the multiplayer room. These are game points, and they aren't on chain.</p>
        </section>
      )}

      <section id="dig-crew" className="mt-5">
        <h3 className="label mb-2">{me?.crew ? `Your crew: ${crewOf(me.crew)?.name}` : "Pick a crew"}</h3>
        <ul className="grid grid-cols-2 gap-2">
          {data.crews.map((c) => (
            <li key={c.slug}>
              <button disabled={busy} aria-pressed={me?.crew === c.slug} onClick={() => act("/dig/crew", { crew: c.slug })} className={`w-full h-full text-left card p-2 hover:border-gold ${me?.crew === c.slug ? "border-gold" : ""}`}>
                <span className="flex items-center gap-2"><span aria-hidden className="inline-block w-3 h-3 rounded-full" style={{ background: c.color }} /><span className="title text-xl text-ink">{c.name}</span></span>
                <span className="block text-xs text-gray mt-0.5">{c.motto}</span>
                <span className="block font-data text-xs text-dim mt-1">{formatInt(c.points)} pts · {c.members} in crew · {c.chambers} chambers</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section id="dig-call" className="mt-5">
        <h3 className="label mb-1">Call shift {data.shift.open.index}</h3>
        <p className="text-sm text-dim">What will the wheel do from {formatUtc(data.shift.open.startsAt)} for six hours? Calls lock in <span className="text-ink font-data"><Countdown to={data.shift.open.locksAt} /></span>.</p>
        <div className="grid grid-cols-2 gap-2 mt-2" role="group" aria-label="Your call">
          {BANDS.map((b) => (
            <button key={b.slug} disabled={busy || !!me?.openCall} aria-pressed={me?.openCall === b.slug} onClick={() => (me?.crew || !user ? act("/dig/call", { band: b.slug }) : setNote("Join a crew first."))} className={`card p-2 text-left ${me?.openCall === b.slug ? "border-gold" : me?.openCall ? "opacity-50" : "hover:border-gold"}`}>
              <span className="title text-xl text-ink block">{b.name}</span><span className="text-xs text-gray">{b.detail}</span>
            </button>
          ))}
        </div>
        {me?.openCall && <p role="status" className="text-sm text-mint mt-2">You called {bandName(me.openCall)}. It's locked in.</p>}
        {!user && <p className="text-sm text-gray mt-2">You'll need an account to play. Tap a crew or a call to sign in.</p>}
        {note && <p role="alert" className="text-sm text-rose mt-2">{note}</p>}
        <p className="label mt-2">{data.shift.open.calls} call{data.shift.open.calls === 1 ? "" : "s"} so far. Picks stay hidden until the shift locks.</p>
      </section>

      {me && me.played > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-5">
          <Stat label="Your points" value={formatInt(me.points)} />
          <Stat label="Right" value={`${me.wins}/${me.played}`} />
          <Stat label="Streak" value={String(me.streak)} />
        </div>
      )}

      <section className="card p-3 mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="title text-xl text-ink">Contribute on-chain</h3><p className="text-xs text-gray">Pull a checkpoint or put a Squeek to work for crew points.</p></div>
          <button className="btn btn-gold" onClick={() => open({ kind: "contribute" })}>Open</button>
        </div>
        {!!data.contributions?.length && <ul className="mt-2 space-y-1">{data.contributions.slice(0, 4).map((c) => <li key={c.txHash} className="flex flex-wrap items-center justify-between gap-2 text-xs text-dim border-t border-line pt-1"><span>{c.displayName ?? c.username}: {c.kind} · +{c.points}</span><TxLink hash={c.txHash} /></li>)}</ul>}
      </section>

      <Section title={`Shift ${running.index} is running`}>
        <p className="text-sm text-dim">Ends {formatUtc(running.endsAt)}, then settles once the rounds reach Ethereum.</p>
        {runningTotal > 0 ? <ul className="flex flex-wrap gap-3 mt-1 text-xs font-data text-dim">{BANDS.map((b) => <li key={b.slug}>{b.name}: {running.picks[b.slug]}</li>)}</ul> : <p className="text-xs text-gray mt-1">Nobody called this one.</p>}
      </Section>

      <Section title="Settled shifts">
        {data.results.length ? (
          <ul className="space-y-1">{data.results.map((r) => {
            const mine = me?.recent.find((c) => c.shiftIndex === r.index);
            const total = Object.values(r.picks).reduce((a, b) => a + b, 0);
            return (
              <li key={r.index} className="card p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-ink">Shift {r.index}: <strong>{bandName(r.band)}</strong> · {formatInt(r.workUnits)} work</span>{r.transactionHash && <TxLink hash={r.transactionHash} />}</div>
                <div className="flex flex-wrap items-center gap-3 mt-0.5"><Time at={r.settledAt} /><span className="text-xs text-gray">{total ? `${r.picks[r.band]} of ${total} called it` : "No calls"}</span>{mine && <span className={`text-xs ${mine.correct ? "text-mint" : "text-gray"}`}>{mine.correct ? `You were right: +${mine.points}` : `You called ${bandName(mine.band)}`}</span>}</div>
              </li>
            );
          })}</ul>
        ) : <Empty>The first shift hasn't settled yet.</Empty>}
      </Section>

      <Section title="Chambers broken through">
        {data.chambers.length ? (
          <ul className="space-y-1">{data.chambers.slice(0, 12).map((c) => (
            <li key={c.number} className="card p-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink">Chamber {c.number} <span className="text-gray">· {c.crew ? `claimed by ${crewOf(c.crew)?.name}` : "unclaimed"}</span></span>
              <span className="flex items-center gap-2"><Time at={c.brokeAt} /><TxLink hash={c.transactionHash} /></span>
            </li>
          ))}</ul>
        ) : <Empty>No breakthroughs yet in this release.</Empty>}
        <p className="text-xs text-gray mt-2">Every 1,000 settled work breaks through a chamber. The crew with the most points since the last breakthrough claims it. A tie claims nothing.</p>
      </Section>

      <Section title="Top diggers">
        {data.leaderboard.length ? (
          <ol className="space-y-1">{data.leaderboard.map((p, i) => (
            <li key={p.username} className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-sm">
              <button className="text-left text-ink hover:text-gold min-w-0 truncate" onClick={() => open({ kind: "user", username: p.username })}>
                <span className="font-data text-gray mr-2">{i + 1}</span>{p.displayName ?? p.username}
                {p.squeekId && <span className="font-data text-xs text-amber ml-2">Squeek #{p.squeekId} · Lv {p.squeekLevel}</span>}
              </button>
              <span className="font-data text-xs text-dim shrink-0"><span aria-hidden className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: crewOf(p.crew)?.color }} />{formatInt(p.points)} pts</span>
            </li>
          ))}</ol>
        ) : <Empty>Nobody has scored yet. It could be you.</Empty>}
      </Section>

      {user && me?.crew && <Squeeks current={me.squeekId} onDone={() => { void reload(); bump(); refreshMultiplayer(); }} />}
    </div>
  );
}
