"use client";
import { useEffect } from "react";
import { PanelContent } from "../panels/PanelContent";
import { useLoadMe } from "../panels/account";
import { useWorld, type Panel, loadSettings } from "@/lib/store";
import { useLiveWorld } from "@/lib/use-live";
import { PanelHistoryBar, SiteFoot } from "./Chrome";

/** A shared link goes straight to the record. Links inside it swap the record in place, with a back button. */
export function SharedRecord({ panel, worldHref }: { panel: Panel; worldHref: string }) {
  useLoadMe();
  useLiveWorld(false);
  const current = useWorld((s) => s.panel);
  useEffect(() => {
    useWorld.setState({ panel, history: [], settings: loadSettings() });
  }, [panel]);
  return (
    <main className="min-h-screen dot-grid">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <nav className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <a href="/" className="flex items-center gap-2"><img src="/brand/squeekchain-mark.png" alt="" width={28} height={28} /><span className="title text-xl">Squeek Time Machine</span></a>
          <div className="flex flex-wrap gap-2"><a href="/archive" className="btn">2D archive</a><a href={worldHref} className="btn btn-gold">Enter the world</a></div>
        </nav>
        <div className="bg-bg border border-line p-4 sm:p-6">
          <PanelHistoryBar />
          <PanelContent panel={current ?? panel} />
        </div>
        <SiteFoot />
      </div>
    </main>
  );
}
