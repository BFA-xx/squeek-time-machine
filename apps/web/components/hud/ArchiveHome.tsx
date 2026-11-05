"use client";
import { ROOMS, formatInt, type RoomSlug } from "@stm/shared";
import { useEffect } from "react";
import { useLoadMe, useMe } from "../panels/account";
import { PanelContent } from "../panels/PanelContent";
import { loadSettings, useWorld } from "@/lib/store";
import { useLiveWorld } from "@/lib/use-live";
import { PanelHistoryBar, SiteFoot } from "./Chrome";
import { LiveBadge, SourceBanner } from "./LiveBadge";

/** The whole product without WebGL: the fallback for weak devices, and the accessible route for everyone. */
export function ArchiveHome() {
  useLoadMe();
  useLiveWorld(false);
  const panel = useWorld((s) => s.panel);
  const open = useWorld((s) => s.openPanel);
  const world = useWorld((s) => s.world);
  const me = useMe((s) => s.me);
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room") as RoomSlug | null;
    useWorld.setState({ settings: loadSettings(), panel: { kind: "room", room: room && ROOMS.some((r) => r.slug === room) ? room : "timeline" }, history: [] });
  }, []);
  const activeRoom = panel?.kind === "room" ? panel.room : null;
  return (
    <main className="min-h-screen dot-grid">
      <div className="max-w-6xl mx-auto px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2"><img src="/brand/squeekchain-mark.png" alt="" width={32} height={32} /><h1 className="title text-3xl">Squeek Time Machine</h1></a>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => open({ kind: "search" })}>Search</button>
            <button className="btn" onClick={() => open({ kind: "account" })}>{me ? me.username : "Sign in"}</button>
            <a className="btn btn-gold" href="/">Enter the 3D world</a>
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-3"><LiveBadge />{world && <span className="label">{formatInt(world.counts.events)} events · {formatInt(world.counts.blocks)} blocks · {formatInt(world.counts.memories)} memories</span>}</div>
        <SourceBanner />
        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[220px_minmax(0,1fr)] gap-4 mt-4">
          <nav aria-label="Rooms" className="min-w-0">
            <ul className="flex md:flex-col gap-1 overflow-x-auto scrollbar-thin pb-2">
              {ROOMS.map((r) => (
                <li key={r.slug} className="shrink-0">
                  <button aria-current={activeRoom === r.slug ? "page" : undefined} className={`w-full text-left border px-3 py-2 ${activeRoom === r.slug ? "border-gold bg-bench" : "border-line bg-raised hover:border-gray"}`} onClick={() => useWorld.setState({ panel: { kind: "room", room: r.slug }, history: [] })}>
                    <span className="title text-lg block whitespace-nowrap" style={{ color: r.color }}>{r.name}</span>
                    <span className="text-xs text-gray hidden md:block">{r.tagline}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="bg-bg border border-line p-4 sm:p-6 min-w-0" aria-live="polite">
            <PanelHistoryBar />
            {panel && <PanelContent panel={panel} />}
          </section>
        </div>
        <SiteFoot />
      </div>
    </main>
  );
}
