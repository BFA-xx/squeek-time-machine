"use client";
import { formatUtc, shortHash, etherscanTx } from "@stm/shared";
import { useWorld, type Panel } from "@/lib/store";

export function Loading({ label = "Reading the archive…" }: { label?: string }) {
  return <p role="status" className="label py-6 animate-pulse">{label}</p>;
}

export function ErrorNote({ children, retry }: { children: React.ReactNode; retry?: () => void }) {
  return (
    <div role="alert" className="card p-3 text-sm text-dim">
      <p>{children}</p>
      {retry && <button className="btn mt-2" onClick={retry}>Try again</button>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray py-3">{children}</p>;
}

export function Heading({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <header className="mb-4">
      {eyebrow && <p className="label mb-1">{eyebrow}</p>}
      <h2 className="title text-4xl text-ink">{title}</h2>
      {sub && <p className="mt-2 text-sm text-dim">{sub}</p>}
    </header>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-3 min-w-0">
      <p className="label truncate">{label}</p>
      <p className="title text-3xl mt-1 text-ink truncate">{value}</p>
      {note && <p className="text-xs text-gray mt-1">{note}</p>}
    </div>
  );
}

const PROOF = {
  chain: { text: "Confirmed on Ethereum", cls: "border-mint/50 text-mint", icon: "◆" },
  measured: { text: "Device measurement", cls: "border-amber/50 text-amber", icon: "◇" },
  archive: { text: "Archive note", cls: "border-sky/50 text-sky", icon: "▣" },
  community: { text: "Community", cls: "border-rose/50 text-rose", icon: "●" },
} as const;

export function ProofBadge({ kind }: { kind: keyof typeof PROOF }) {
  const p = PROOF[kind];
  return <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wider ${p.cls}`}><span aria-hidden>{p.icon}</span>{p.text}</span>;
}

export const proofOf = (e: { provisional: boolean; sourceKind: string }): keyof typeof PROOF => (e.sourceKind === "archive" ? "archive" : e.provisional ? "measured" : "chain");

export function Time({ at }: { at: string }) {
  return <time dateTime={at} className="font-data text-xs text-gray">{formatUtc(at)}</time>;
}

export function TxLink({ hash }: { hash: string }) {
  return <a className="font-data text-xs text-sky underline underline-offset-2 break-all" href={etherscanTx(hash)} target="_blank" rel="noopener noreferrer nofollow">{shortHash(hash)} ↗</a>;
}

export function PanelLink({ to, children, className }: { to: Panel; children: React.ReactNode; className?: string }) {
  const open = useWorld((s) => s.openPanel);
  return <button className={className ?? "text-left text-sky underline underline-offset-2 text-sm"} onClick={() => open(to)}>{children}</button>;
}

export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="label pt-0.5">{k}</dt>
          <dd className="text-dim min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShareBar({ path, subject, text }: { path: string; subject: string; text: string }) {
  const url = () => `${window.location.origin}${path}`;
  const record = () => fetch("/api/v1/community/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject }) }).catch(() => undefined);
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <CopyButton getText={url} onCopied={record} />
      <button className="btn" onClick={() => { void record(); window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`, "_blank", "noopener,noreferrer"); }}>Share on X</button>
    </div>
  );
}

import { useState } from "react";
export function CopyButton({ getText, onCopied }: { getText: () => string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn" onClick={async () => {
      try {
        await navigator.clipboard.writeText(getText());
        setDone(true);
        onCopied?.();
        setTimeout(() => setDone(false), 1800);
      } catch {
        window.prompt("Copy this link", getText());
      }
    }}>{done ? "Copied" : "Copy link"}</button>
  );
}
