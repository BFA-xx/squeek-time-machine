"use client";
import { create } from "zustand";
import type { RoomSlug } from "@stm/shared";
import type { Measurement, WorldState } from "./api";

export type Quality = "auto" | "low" | "medium" | "high";
export interface Settings { quality: Quality; reducedMotion: boolean; sound: boolean; volume: number; clickToMove: boolean; introSeen: boolean }

const DEFAULTS: Settings = { quality: "auto", reducedMotion: false, sound: false, volume: 0.6, clickToMove: true, introSeen: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("stm.settings");
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return { ...DEFAULTS, reducedMotion: prefersReduced, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULTS;
  }
}

export type Panel =
  | { kind: "room"; room: RoomSlug }
  | { kind: "event"; id: string }
  | { kind: "block"; height: string }
  | { kind: "artifact"; slug: string }
  | { kind: "user"; username: string }
  | { kind: "search" }
  | { kind: "settings" }
  | { kind: "account" }
  | { kind: "discovery"; slug: string }
  | { kind: "write"; mode: "memory" | "expectation" }
  | { kind: "dig"; focus?: "call" | "crew" }
  | { kind: "squeeks" }
  | { kind: "squeek"; id: string };

export interface Live extends Measurement {
  provisional?: boolean;
  projectedHeight?: string | null;
  projectedProgress?: string | null;
  settledHeight?: string | null;
}

export interface Toast { id: number; title: string; panel?: Panel; tone: "chain" | "measured" | "community" }

interface WorldStore {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  world: WorldState | null;
  setWorld: (w: WorldState) => void;
  live: Live | null;
  setLive: (l: Live) => void;
  panel: Panel | null;
  history: Panel[];
  openPanel: (p: Panel) => void;
  closePanel: () => void;
  backPanel: () => void;
  location: RoomSlug | "hub" | "tunnel";
  setLocation: (l: RoomSlug | "hub" | "tunnel") => void;
  prompt: { label: string; action: () => void } | null;
  setPrompt: (p: { label: string; action: () => void } | null) => void;
  travel: RoomSlug | "hub" | null;
  requestTravel: (t: RoomSlug | "hub" | null) => void;
  graphicsFallback: boolean;
  blockBump: number;
  bumpBlocks: () => void;
  eventBump: number;
  bumpEvents: () => void;
  memoryBump: number;
  bumpMemories: () => void;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dropToast: (id: number) => void;
  highlightBlock: string | null;
  setHighlightBlock: (h: string | null) => void;
  connection: "connecting" | "live" | "lost";
  setConnection: (c: "connecting" | "live" | "lost") => void;
  found: string[];
  markFound: (slug: string) => void;
  /** Which wheel the visitor is running on, if any. */
  ride: false | "hub" | "wheel";
  setRide: (on: false | "hub" | "wheel") => void;
  digBump: number;
  bumpDig: () => void;
  digMe: { crew: string | null; squeekLevel: number | null } | null;
  setDigMe: (m: { crew: string | null; squeekLevel: number | null } | null) => void;
}

let toastId = 0;

export const useWorld = create<WorldStore>((set, get) => ({
  settings: DEFAULTS,
  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    try {
      localStorage.setItem("stm.settings", JSON.stringify(settings));
    } catch {}
    set({ settings });
  },
  world: null,
  setWorld: (world) => set({ world }),
  live: null,
  setLive: (live) => set({ live }),
  panel: null,
  history: [],
  openPanel: (p) => set((st) => ({ panel: p, history: st.panel ? [...st.history.slice(-10), st.panel] : [] })),
  closePanel: () => set({ panel: null, history: [] }),
  backPanel: () => set((st) => ({ panel: st.history[st.history.length - 1] ?? null, history: st.history.slice(0, -1) })),
  location: "hub",
  setLocation: (location) => (get().location === location ? undefined : set({ location })),
  prompt: null,
  setPrompt: (prompt) => set({ prompt }),
  travel: null,
  requestTravel: (travel) => set({ travel }),
  graphicsFallback: false,
  blockBump: 0,
  bumpBlocks: () => set((s) => ({ blockBump: s.blockBump + 1 })),
  eventBump: 0,
  bumpEvents: () => set((s) => ({ eventBump: s.eventBump + 1 })),
  memoryBump: 0,
  bumpMemories: () => set((s) => ({ memoryBump: s.memoryBump + 1 })),
  toasts: [],
  pushToast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => get().dropToast(id), 7000);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  highlightBlock: null,
  setHighlightBlock: (highlightBlock) => set({ highlightBlock }),
  connection: "connecting",
  setConnection: (connection) => set({ connection }),
  ride: false,
  setRide: (ride) => set({ ride }),
  digBump: 0,
  bumpDig: () => set((s) => ({ digBump: s.digBump + 1 })),
  digMe: null,
  setDigMe: (digMe) => set({ digMe }),
  found: [],
  markFound: (slug) => {
    const found = [...new Set([...get().found, slug])];
    try {
      localStorage.setItem("stm.found", JSON.stringify(found));
    } catch {}
    set({ found });
  },
}));
