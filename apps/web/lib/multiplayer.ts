"use client";
import type { Emote, PlayerInfo, RideCode } from "@stm/shared";
import { create } from "zustand";
import { api } from "./api";
import { useWorld } from "./store";

export interface Remote extends PlayerInfo {
  x: number; z: number; yaw: number; s: number; r: RideCode;
  /** What's on screen, eased toward the last position the room sent. */
  vx: number; vz: number; vyaw: number;
  hopY: number; hopV: number;
  emote: Emote | null; emoteAt: number;
}

/** Everything that changes many times a second lives here, outside React, so other players never cause a render. */
export const net = {
  players: new Map<number, Remote>(),
  selfId: null as number | null,
  selfEmote: null as Emote | null,
  selfEmoteAt: 0,
  /** Shared RPM and rider count for the giant wheel (1) and the practice wheel (2). */
  wheels: { 1: [0, 0] as [number, number], 2: [0, 0] as [number, number] },
  taps: 0,
  boosted: false,
  proofs: {} as Record<string, string>,
};

export type NetStatus = "off" | "connecting" | "live" | "full" | "replaced";
export const useNet = create<{ status: NetStatus; roster: PlayerInfo[]; hubBusy: boolean }>(() => ({ status: "off", roster: [], hubBusy: false }));

const HIDDEN_CLOSE_MS = 60_000;
const SEND_MS = 250;
const TAP_MS = 150;

let ws: WebSocket | null = null;
let wanted = false;
let generation = 0;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
const last = { x: NaN, z: NaN, yaw: NaN, moving: false, r: 0 as RideCode, sentAt: 0, tappedAt: 0 };

const roster = () => useNet.setState({ roster: [...net.players.values()].map(({ id, name, username, crew, squeekId, squeekLevel }) => ({ id, name, username, crew, squeekId, squeekLevel })) });

function clearPlayers() {
  net.players.clear();
  net.selfId = null;
  net.wheels[1] = [0, 0];
  net.wheels[2] = [0, 0];
  useNet.setState({ roster: [], hubBusy: false });
}

function add(p: PlayerInfo & { x: number; z: number; yaw: number; s: number; r: RideCode }) {
  net.players.set(p.id, { ...p, vx: p.x, vz: p.z, vyaw: p.yaw, hopY: 0, hopV: 0, emote: null, emoteAt: 0 });
}

function schedule(delay?: number) {
  if (!wanted || retryTimer) return;
  // Waits longer each time, so a full free plan or a dead room isn't hammered.
  const wait = delay ?? Math.min(300_000, 3000 * 2 ** retry) * (0.8 + Math.random() * 0.4);
  retry++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void open();
  }, wait);
}

function claimReceipt(k: string, proof: string) {
  net.proofs[k] = proof;
  api<{ points: number }>(`/dig/tasks/${k}`, { method: "POST", body: { proof } }).then((r) => {
    delete net.proofs[k];
    const world = useWorld.getState();
    world.pushToast({ title: k === "together" ? `Ran a wheel together: +${r.points} points` : `Said hello: +${r.points} points`, tone: "community", panel: { kind: "dig" } });
    world.bumpDig();
  }).catch(() => undefined); // Not in a crew, or already done today. The Dig panel can still use the receipt.
}

function onMessage(raw: unknown) {
  if (typeof raw !== "string") return;
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.t === "welcome") {
    net.players.clear();
    net.selfId = m.id;
    for (const p of m.players) add(p);
    retry = 0;
    useNet.setState({ status: "live" });
    roster();
  } else if (m.t === "join") {
    add(m.player);
    roster();
  } else if (m.t === "leave") {
    net.players.delete(m.id);
    roster();
  } else if (m.t === "s") {
    for (const [id, x, z, yaw, s, r] of m.p) {
      const p = net.players.get(id);
      if (p) Object.assign(p, { x, z, yaw, s, r });
    }
    for (const code of [1, 2] as const) {
      const w = m.w?.[code];
      if (w) net.wheels[code] = w;
    }
    const busy = net.wheels[1][1] > 0;
    if (useNet.getState().hubBusy !== busy) useNet.setState({ hubBusy: busy });
  } else if (m.t === "e") {
    if (m.id === net.selfId) {
      net.selfEmote = m.e;
      net.selfEmoteAt = performance.now();
    } else {
      const p = net.players.get(m.id);
      if (p) Object.assign(p, { emote: m.e, emoteAt: performance.now() });
    }
  } else if (m.t === "h") {
    const p = net.players.get(m.id);
    if (p && p.hopY === 0) p.hopV = 5.2;
  } else if (m.t === "proof") {
    claimReceipt(m.k, m.proof);
  } else if (m.t === "full") {
    useNet.setState({ status: "full" });
  }
}

async function open() {
  if (ws || !wanted || document.hidden) return;
  const gen = ++generation;
  if (useNet.getState().status !== "live") useNet.setState({ status: "connecting" });
  let pass: { url: string | null; ticket: string | null };
  try {
    pass = await api("/dig/ticket");
  } catch {
    return schedule();
  }
  if (gen !== generation || !wanted || ws) return;
  // No address means multiplayer isn't set up here. The game carries on as single-player.
  if (!pass.url) return void useNet.setState({ status: "off" });
  let socket: WebSocket;
  try {
    socket = new WebSocket(pass.url);
  } catch {
    return schedule();
  }
  ws = socket;
  socket.onopen = () => socket.send(JSON.stringify({ t: "hello", ticket: pass.ticket }));
  socket.onmessage = (e) => onMessage(e.data);
  socket.onclose = (e) => {
    if (ws !== socket) return;
    ws = null;
    clearPlayers();
    last.x = NaN;
    if (e.code === 4002) return void useNet.setState({ status: "replaced" }); // Another tab has this hamster. Fighting it would loop forever.
    if (e.code === 4001) {
      useNet.setState({ status: "full" });
      return schedule(60_000);
    }
    useNet.setState({ status: "connecting" });
    schedule();
  };
}

function drop() {
  generation++;
  const s = ws;
  ws = null;
  s?.close();
  clearPlayers();
  last.x = NaN;
}

function onVisibility() {
  if (document.hidden) {
    // A background tab shouldn't use up the room's free allowance.
    hiddenTimer ??= setTimeout(() => {
      hiddenTimer = null;
      drop();
    }, HIDDEN_CLOSE_MS);
    return;
  }
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  retry = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  void open();
}

export function startMultiplayer() {
  wanted = true;
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", onVisibility);
  }
  void open();
}

export function stopMultiplayer() {
  wanted = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  drop();
  useNet.setState({ status: "off" });
}

/** Rejoins with a fresh pass after the player's name, crew or shown Squeek changes. */
export function refreshMultiplayer() {
  if (!wanted) return;
  drop();
  void open();
}

const send = (m: unknown) => {
  if (ws?.readyState === WebSocket.OPEN && net.selfId !== null) ws.send(JSON.stringify(m));
};

export const sendEmote = (e: Emote) => send({ t: "emote", e });
export const sendHop = () => send({ t: "hop" });

/** Called every frame, but only sends when something's really changed. */
export function publish(p: { x: number; z: number; yaw: number; speed: number }, r: RideCode, now: number) {
  if (net.selfId === null) return;
  if (net.taps > 0 && now - last.tappedAt >= TAP_MS) {
    send({ t: "tap", n: Math.min(net.taps, 10), b: net.boosted ? 1 : 0 });
    net.taps = 0;
    net.boosted = false;
    last.tappedAt = now;
  }
  if (now - last.sentAt < SEND_MS) return;
  const yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
  const moving = p.speed > 0.05;
  const changed = r !== last.r || moving !== last.moving || !(Math.abs(p.x - last.x) < 0.04) || !(Math.abs(p.z - last.z) < 0.04) || !(Math.abs(yaw - last.yaw) < 0.05);
  if (!changed) return;
  send({ t: "p", x: p.x, z: p.z, yaw, s: Math.min(40, Math.max(0, p.speed)), r });
  Object.assign(last, { x: p.x, z: p.z, yaw, moving, r, sentAt: now });
}
