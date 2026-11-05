"use client";
import { LIMITS, REACTIONS, REACTION_GLYPHS, formatUtc, type ReactionKind } from "@stm/shared";
import { useEffect, useState } from "react";
import { api, subjectHref, useApi, type CommentRow, type Memory } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { useLoadMe, useMe } from "./account";
import { CopyButton, Empty, ErrorNote, Loading, ProofBadge } from "./ui";

function SignInNudge({ what }: { what: string }) {
  const open = useWorld((s) => s.openPanel);
  return <button className="btn w-full text-left" onClick={() => open({ kind: "account" })}>Sign in to {what}</button>;
}

export function ReactionRow({ subject, counts }: { subject: string; counts: Record<string, number> }) {
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const [state, setState] = useState(counts);
  const [mine, setMine] = useState<Record<string, boolean>>({});
  const toggle = async (kind: ReactionKind) => {
    if (!me) return open({ kind: "account" });
    try {
      const r = await api<{ kind: string; active: boolean; count: number }>("/community/reactions", { method: "POST", body: { subject, kind } });
      setState((s) => ({ ...s, [kind]: r.count }));
      setMine((m) => ({ ...m, [kind]: r.active }));
    } catch {}
  };
  return (
    <div className="flex flex-wrap gap-1">
      {REACTIONS.map((k) => (
        <button key={k} aria-label={`React ${k}`} aria-pressed={!!mine[k]} onClick={() => toggle(k)} className={`px-1.5 py-0.5 text-xs border rounded-sm ${mine[k] ? "border-gold text-gold" : "border-line text-gray hover:border-gray"}`}>
          {REACTION_GLYPHS[k]}{state[k] ? <span className="ml-1 font-data">{state[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ReportButton({ subject }: { subject: string }) {
  const me = useMe((s) => s.me);
  const open = useWorld((s) => s.openPanel);
  const [done, setDone] = useState(false);
  if (done) return <span className="label">Reported. Thanks.</span>;
  return (
    <button className="label underline underline-offset-2 hover:text-rose" onClick={async () => {
      if (!me) return open({ kind: "account" });
      const reason = window.prompt("What's wrong with this post?");
      if (!reason) return;
      try {
        await api("/community/reports", { method: "POST", body: { subject, reason } });
        setDone(true);
      } catch (e) {
        window.alert((e as Error).message);
      }
    }}>Report</button>
  );
}

function Author({ name, displayName }: { name: string; displayName?: string | null }) {
  const open = useWorld((s) => s.openPanel);
  return (
    <button className="font-data text-xs text-amber hover:underline" aria-label={`Profile of ${displayName ?? name}`} onClick={() => open({ kind: "user", username: name })}>
      {displayName ?? name}{displayName && <span className="text-gray"> @{name}</span>}
    </button>
  );
}

export function MemoryCard({ m, children }: { m: Pick<Memory, "id" | "kind" | "body" | "createdAt" | "username" | "displayName"> & { subject?: string; reactions?: Record<string, number> }; children?: React.ReactNode }) {
  const href = m.subject ? subjectHref(m.subject) : null;
  return (
    <article id={`memory-${m.id}`} className="card p-3">
      <p className="pre-wrap text-sm text-ink">{m.body}</p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Author name={m.username} displayName={m.displayName} />
        <time dateTime={m.createdAt} className="font-data text-xs text-gray">{formatUtc(m.createdAt)}</time>
        {m.kind !== "memory" && <span className="label">{m.kind}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <ReactionRow subject={`memory:${m.id}`} counts={m.reactions ?? {}} />
        <span className="flex items-center gap-2">
          {href && <CopyButton getText={() => `${window.location.origin}${href}#memory-${m.id}`} />}
          <ReportButton subject={`memory:${m.id}`} />
        </span>
      </div>
      {children}
    </article>
  );
}

/** "I WAS HERE". A personal memory attached to one record, always shown apart from the official facts. */
export function IWasHere({ subject, heading = "I was here" }: { subject: string; heading?: string }) {
  useLoadMe();
  const me = useMe((s) => s.me);
  const bump = useWorld((s) => s.memoryBump);
  const { data, error, loading, reload } = useApi<Memory[]>(`/community/memories?subject=${encodeURIComponent(subject)}`, [bump]);
  const [body, setBody] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A shared memory link lands on that memory once the list has loaded.
  useEffect(() => {
    if (data && window.location.hash.startsWith("#memory-")) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [data]);
  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api("/community/memories", { method: "POST", body: { subject, body } });
      setBody("");
      await reload();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6" aria-labelledby={`iwh-${subject}`}>
      <div className="flex items-center gap-2 mb-2">
        <h3 id={`iwh-${subject}`} className="title text-2xl text-gold uppercase tracking-wide">{heading}</h3>
        <ProofBadge kind="community" />
      </div>
      {me ? (
        <form onSubmit={post} className="space-y-2 mb-3">
          <label className="sr-only" htmlFor={`m-${subject}`}>Your memory of this moment</label>
          <textarea id={`m-${subject}`} className="field min-h-20" maxLength={LIMITS.memory} value={body} onChange={(e) => setBody(e.target.value)} placeholder="I was here when…" />
          <div className="flex items-center justify-between gap-2">
            <span className="label">{body.length}/{LIMITS.memory}</span>
            <button className="btn btn-gold" disabled={busy || !body.trim()}>Leave a memory</button>
          </div>
          {note && <p role="alert" className="text-sm text-rose">{note}</p>}
        </form>
      ) : <div className="mb-3"><SignInNudge what="leave a memory" /></div>}
      {loading && !data ? <Loading label="Finding memories…" /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : data?.length ? (
        <div className="space-y-2">{data.map((m) => <MemoryCard key={m.id} m={m} />)}</div>
      ) : <Empty>No memories here yet. Yours could be the first.</Empty>}
    </section>
  );
}

export function Discussion({ subject }: { subject: string }) {
  useLoadMe();
  const me = useMe((s) => s.me);
  const bump = useWorld((s) => s.memoryBump);
  const { data, error, loading, reload } = useApi<CommentRow[]>(`/community/comments?subject=${encodeURIComponent(subject)}`, [bump]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api("/community/comments", { method: "POST", body: { subject, body, parentId: replyTo?.id } });
      setBody("");
      setReplyTo(null);
      await reload();
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const top = data?.filter((c) => !c.parentId) ?? [];
  const replies = (id: string) => data?.filter((c) => c.parentId === id) ?? [];
  const Row = ({ c, nested }: { c: CommentRow; nested?: boolean }) => (
    <article className={`py-2 ${nested ? "pl-3 ml-1 border-l border-line" : "border-t border-line"}`}>
      <div className="flex flex-wrap items-center gap-2"><Author name={c.username} displayName={c.displayName} /><time dateTime={c.createdAt} className="font-data text-xs text-gray">{formatUtc(c.createdAt)}</time></div>
      <p className="pre-wrap text-sm text-ink mt-1">{c.body}</p>
      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <ReactionRow subject={`comment:${c.id}`} counts={c.reactions} />
        {!nested && me && <button className="label underline underline-offset-2" onClick={() => setReplyTo(c)}>Reply</button>}
        <ReportButton subject={`comment:${c.id}`} />
      </div>
    </article>
  );
  return (
    <section className="mt-6">
      <h3 className="label mb-2">Discussion</h3>
      {loading && !data ? <Loading label="Loading the conversation…" /> : error ? <ErrorNote retry={reload}>{error}</ErrorNote> : top.length ? top.map((c) => <div key={c.id}><Row c={c} />{replies(c.id).map((r) => <Row key={r.id} c={r} nested />)}</div>) : <Empty>Nobody has said anything here yet.</Empty>}
      {me ? (
        <form onSubmit={post} className="space-y-2 mt-3">
          {replyTo && <p className="text-xs text-gray">Replying to {replyTo.username}. <button type="button" className="underline" onClick={() => setReplyTo(null)}>Cancel</button></p>}
          <label className="sr-only" htmlFor={`c-${subject}`}>Your comment</label>
          <textarea id={`c-${subject}`} className="field min-h-16" maxLength={LIMITS.comment} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add to the conversation" />
          <div className="flex justify-end"><button className="btn" disabled={busy || !body.trim()}>Post</button></div>
          {note && <p role="alert" className="text-sm text-rose">{note}</p>}
        </form>
      ) : <div className="mt-3"><SignInNudge what="join the discussion" /></div>}
    </section>
  );
}
