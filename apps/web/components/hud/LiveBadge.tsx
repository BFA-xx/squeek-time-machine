"use client";
import { formatUtc, rpmFromMilli } from "@stm/shared";
import { API_OFFLINE } from "@/lib/api";
import { useWorld } from "@/lib/store";

export function LiveBadge() {
  const live = useWorld((s) => s.live);
  const connection = useWorld((s) => s.connection);
  if (!live) return <span className="label">Wheel: waiting for a reading</span>;
  const running = (live.rpmMilli ?? 0) > 0;
  const stale = live.freshness !== undefined && live.freshness !== "online";
  return (
    <span className="inline-flex flex-wrap items-center gap-2 font-data text-xs text-dim" title="A live device measurement. Only settled work is certified on Ethereum.">
      <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${stale ? "bg-gray" : running ? "bg-mint animate-pulse" : "bg-amber"}`} />
      {stale ? "Wheel: no fresh reading" : running ? `Wheel: running · ${rpmFromMilli(live.rpmMilli!)} RPM` : "Wheel: still"}
      <span className="text-gray">measured{connection === "live" ? "" : " · reconnecting"}</span>
    </span>
  );
}

const NAMES: Record<string, string> = { "api.events": "event feed", "api.status": "wheel status", "api.core": "protocol state", "api.economy": "economy", "api.settlements": "settlements", "api.stats": "wheel statistics" };

/** Says plainly when something is old or missing. The numbers on screen are never passed off as current. */
export const OFFLINE_NOTICE = "This is a preview. The live archive isn't online yet, so you can walk the burrow and run the practice wheels, but records, accounts, The Great Dig and multiplayer aren't available.";

export function SourceBanner({ compact = false }: { compact?: boolean }) {
  if (API_OFFLINE) {
    return compact
      ? <p role="status" className="inline-block bg-bg/70 border border-amber/40 px-2 py-1 font-data text-xs text-amber">Preview: live data offline</p>
      : <p role="status" className="mt-2 border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-amber">{OFFLINE_NOTICE}</p>;
  }
  return <LiveSourceBanner compact={compact} />;
}

function LiveSourceBanner({ compact }: { compact: boolean }) {
  const world = useWorld((s) => s.world);
  const down = world?.sources.filter((s) => s.status !== "ok" && NAMES[s.key]) ?? [];
  if (!down.length) return null;
  const last = down.map((d) => d.lastSuccessAt).filter(Boolean).sort()[0];
  if (compact) {
    return <p role="status" title={`Unavailable: ${down.map((d) => NAMES[d.key]).join(", ")}`} className="inline-block bg-bg/70 border border-amber/40 px-2 py-1 font-data text-[11px] text-amber">{down.length} official feed{down.length === 1 ? "" : "s"} down · showing the last good copy{last ? ` from ${last.slice(11, 16)} UTC` : ""}</p>;
  }
  return (
    <p role="status" className="mt-2 border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-amber">
      The official {down.map((d) => NAMES[d.key]).join(", ")} {down.length === 1 ? "is" : "are"} unavailable right now, so you're seeing the last good copy{last ? ` from ${formatUtc(last)}` : ""}. Nothing here has been estimated.
    </p>
  );
}
