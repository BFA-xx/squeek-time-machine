"use client";
import { useEffect } from "react";
import { API, API_OFFLINE, api, type WorldState } from "./api";
import { useWorld, type Live } from "./store";

/** One SSE connection for the page. The browser hears from our server only, never the official API. */
export function useLiveWorld(toasts = true) {
  const { setWorld, setLive, bumpBlocks, bumpEvents, bumpMemories, bumpDig, pushToast, setConnection } = useWorld.getState();
  useEffect(() => {
    if (API_OFFLINE) return setConnection("lost");
    let closed = false;
    const refresh = () => api<WorldState>("/world/state").then((w) => {
      if (closed) return;
      setWorld(w);
      if (w.live?.measurement) setLive({ ...w.live.measurement, provisional: true, projectedHeight: w.live.projected?.blockHeight ?? null, projectedProgress: w.live.projected?.blockProgress ?? null, settledHeight: w.live.settled?.blockHeight ?? null });
    }).catch(() => undefined);
    void refresh();
    const slow = setInterval(refresh, 60_000);

    const es = new EventSource(`${API}/stream`);
    es.onopen = () => setConnection("live");
    es.onerror = () => setConnection(es.readyState === EventSource.CLOSED ? "lost" : "connecting");
    const parse = (e: Event) => {
      try {
        return JSON.parse((e as MessageEvent).data);
      } catch {
        return null;
      }
    };
    es.addEventListener("live", (e) => {
      const d = parse(e) as Live | null;
      if (d) setLive(d);
    });
    es.addEventListener("event", (e) => {
      const d = parse(e) as { id: string; title: string; provisional: boolean; significance: number } | null;
      if (!d) return;
      bumpEvents();
      if (toasts && d.significance >= 3) pushToast({ title: d.title, panel: { kind: "event", id: d.id }, tone: d.provisional ? "measured" : "chain" });
    });
    es.addEventListener("block", () => {
      bumpBlocks();
      void refresh();
    });
    es.addEventListener("milestone", (e) => {
      const d = parse(e) as { title: string } | null;
      if (d && toasts) pushToast({ title: `Milestone: ${d.title}`, tone: "chain" });
      void refresh();
    });
    es.addEventListener("source", () => void refresh());
    es.addEventListener("dig", (e) => {
      const d = parse(e) as { kind: string; index?: number; band?: string; number?: number; work?: string; calls?: number } | null;
      bumpDig();
      if (!d || !toasts) return;
      if (d.kind === "shift" && d.calls) pushToast({ title: `Shift ${d.index} settled: ${d.band}, ${d.work} work`, panel: { kind: "dig" }, tone: "chain" });
      if (d.kind === "chamber") pushToast({ title: `Breakthrough! Chamber ${d.number} is open`, panel: { kind: "dig" }, tone: "chain" });
    });
    es.addEventListener("community", (e) => {
      const d = parse(e) as { kind: string; username?: string; subject?: string } | null;
      bumpMemories();
      if (d && d.kind === "memory" && toasts) pushToast({ title: `${d.username} left a memory`, tone: "community" });
    });
    return () => {
      closed = true;
      clearInterval(slow);
      es.close();
    };
  }, [toasts]); // eslint-disable-line react-hooks/exhaustive-deps
}
