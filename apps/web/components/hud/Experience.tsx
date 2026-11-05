"use client";
import { ROOMS, formatInt } from "@stm/shared";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { audio } from "@/lib/audio";
import { loadSettings, useWorld } from "@/lib/store";
import { useLiveWorld } from "@/lib/use-live";
import { useLoadMe, useMe } from "../panels/account";
import { SEEDS } from "../panels/discoveries";
import { PanelContent } from "../panels/PanelContent";
import { input } from "../world/input";
import { rideTap } from "../world/ride";
import { LiveBadge, SourceBanner } from "./LiveBadge";
import { RidePanel } from "./RidePanel";

const World = dynamic(() => import("../world/World"), { ssr: false });

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (id.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const d = Math.min(1, Math.hypot(dx, dy) / max);
    const a = Math.atan2(dy, dx);
    input.axisX = Math.cos(a) * d;
    input.axisY = Math.sin(a) * d;
    setKnob({ x: Math.cos(a) * d * max * 0.6, y: Math.sin(a) * d * max * 0.6 });
  };
  const end = () => {
    id.current = null;
    input.axisX = input.axisY = 0;
    setKnob({ x: 0, y: 0 });
  };
  return (
    <div ref={base} role="application" aria-label="Move" className="absolute left-4 bottom-24 w-28 h-28 rounded-full border border-line bg-bg/50 touch-none md:hidden"
      onPointerDown={(e) => { id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute left-1/2 top-1/2 w-11 h-11 -ml-[22px] -mt-[22px] rounded-full bg-gold/70" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function Walkthrough({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { t: "This is the burrow", b: "Squeektoshi's whole history, built underground. It grows on its own as real blocks settle." },
    { t: "Walk around", b: "Use WASD or the arrow keys, click the floor, use the stick on a phone, or plug in a controller. Drag to look around." },
    { t: "Eight tunnels", b: "Each glowing arch leads to a room. Walk in, or jump there using the bar at the bottom." },
    { t: "Play The Great Dig", b: "Straight through the wheel, join a crew and call what the wheel will do next. Real settled rounds decide who was right." },
    { t: "Use what you find", b: "Walk up to anything with a gold ring and press E. Read the artifacts, run the practice wheel, hang a memory lantern. Golden seeds are hidden around too." },
  ];
  const s = steps[step];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-x-0 mx-auto top-24 w-[min(92vw,380px)] card p-4 z-30">
      <p className="label">Tip {step + 1} of {steps.length}</p>
      <h2 className="title text-2xl mt-1">{s.t}</h2>
      <p className="text-sm text-dim mt-1">{s.b}</p>
      <div className="flex justify-end gap-2 mt-3">
        <button className="btn" onClick={onDone}>Skip</button>
        <button className="btn btn-gold" onClick={() => (step === steps.length - 1 ? onDone() : setStep(step + 1))}>{step === steps.length - 1 ? "Start exploring" : "Next"}</button>
      </div>
    </motion.div>
  );
}

const LOCATION_LABEL = (loc: string) => (loc === "hub" ? "The Burrow" : loc === "tunnel" ? "In a tunnel" : ROOMS.find((r) => r.slug === loc)?.name ?? "");

export function Experience() {
  useLoadMe();
  useLiveWorld(true);
  const [ready, setReady] = useState(false);
  const [canRender, setCanRender] = useState(true);
  const [stage, setStage] = useState<"title" | "flying" | "world">("title");
  const [walkthrough, setWalkthrough] = useState(false);
  const { panel, openPanel, closePanel, backPanel, history, location, prompt, requestTravel, toasts, world, settings, setSettings, found, dropToast } = useWorld();
  const me = useMe((s) => s.me);
  const live = useWorld((s) => s.live);
  const riding = useWorld((s) => s.ride);

  useEffect(() => {
    const s = loadSettings();
    let f: string[] = [];
    try {
      f = JSON.parse(localStorage.getItem("stm.found") ?? "[]");
    } catch {}
    useWorld.setState({ settings: s, found: f });
    const q = new URLSearchParams(window.location.search);
    if (s.reducedMotion || q.has("moment") || q.has("block") || q.has("room")) setStage("world");
    setCanRender(hasWebGL());
    setReady(true);
  }, []);

  useEffect(() => {
    audio?.setRpm((live?.rpmMilli ?? 0) / 1000);
  }, [live?.rpmMilli]);

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (useWorld.getState().ride) {
        if (e.code === "Escape" || e.code === "KeyE") useWorld.getState().setRide(false);
        else if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.keyBoost = 1;
        else if ((e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") && !e.repeat) {
          e.preventDefault();
          rideTap();
        }
        return;
      }
      if (e.code === "Escape") closePanel();
      if ((e.code === "KeyE" || e.code === "Enter") && !useWorld.getState().panel) {
        const p = useWorld.getState().prompt;
        if (p && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) p.action();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.keyBoost = 1;
      if (/^(Key[WASD]|Arrow)/.test(e.code)) {
        input.keys.add(e.code);
        if (e.code.startsWith("Arrow")) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.keyBoost = 0;
    };
    const blur = () => {
      input.keys.clear();
      input.keyBoost = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [closePanel]);

  const last = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinch = useRef<number | null>(null);

  const enter = () => {
    if (settings.sound) audio?.enable(settings.volume);
    if (settings.reducedMotion) {
      setStage("world");
      return;
    }
    setStage("flying");
    setTimeout(() => {
      setStage("world");
      if (!useWorld.getState().settings.introSeen) setWalkthrough(true);
    }, 7000);
  };

  if (ready && !canRender) {
    return (
      <main className="min-h-screen dot-grid flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <img src="/brand/squeekchain-mark.png" alt="" width={56} height={56} className="mx-auto" />
          <h1 className="title text-5xl mt-3">Squeek Time Machine</h1>
          <p className="text-dim mt-3">This device can't draw the 3D world, but everything in it is available in the 2D archive.</p>
          <a className="btn btn-gold inline-block mt-4" href="/archive">Open the archive</a>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg select-none"
      onPointerDown={(e) => { pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if ((e.target as HTMLElement).tagName === "CANVAS") { last.current = { x: e.clientX, y: e.clientY }; input.dragging = true; } }}
      onPointerMove={(e) => {
        if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current.size === 2) {
          const [a, b] = [...pinch.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastPinch.current !== null) input.onZoom?.((lastPinch.current - d) * 3);
          lastPinch.current = d;
          return;
        }
        if (last.current) { input.onOrbit?.(e.clientX - last.current.x, e.clientY - last.current.y); last.current = { x: e.clientX, y: e.clientY }; }
      }}
      onPointerUp={(e) => { pinch.current.delete(e.pointerId); lastPinch.current = null; last.current = null; input.dragging = false; }}
      onPointerCancel={(e) => { pinch.current.delete(e.pointerId); lastPinch.current = null; last.current = null; input.dragging = false; }}
      onWheel={(e) => { if ((e.target as HTMLElement).tagName === "CANVAS") input.onZoom?.(e.deltaY); }}
    >
      {ready && (
        <div className="absolute inset-0 touch-none" aria-hidden={!!panel}>
          <World stage={stage} onContextLost={() => setCanRender(false)} />
        </div>
      )}
      <div id="travel-fade" className="absolute inset-0 bg-black opacity-0 pointer-events-none z-20" />

      <AnimatePresence>
        {stage !== "world" && (
          <motion.div key="title" exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className={`absolute inset-0 z-40 flex flex-col items-center justify-end pb-[14vh] text-center px-6 ${stage === "title" ? "bg-gradient-to-t from-black/85 via-black/10 to-transparent" : "pointer-events-none"}`}>
            {stage === "title" ? (
              <>
                <img src="/brand/squeekchain-mark.png" alt="" width={64} height={64} />
                <h1 className="title text-6xl sm:text-8xl mt-3 text-ink">Squeek Time Machine</h1>
                <p className="font-voice text-dim mt-2 text-lg">Walk Squeekchain's history. Then join the dig his real rounds are driving.</p>
                {world?.counts && <p className="label mt-2">{formatInt(world.counts.blocks)} blocks · {formatInt(world.counts.events)} events · growing on its own</p>}
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <button autoFocus className="btn btn-gold text-sm px-6 py-3" onClick={enter}>Enter the burrow</button>
                  <button className="btn text-sm px-6 py-3" onClick={() => { setStage("world"); }}>Skip the intro</button>
                  <a className="btn text-sm px-6 py-3" href="/archive">Use the 2D archive</a>
                </div>
                <p className="text-xs text-gray mt-4 max-w-md">Community-built. Not made or endorsed by the Squeekchain team. Testnet data with no monetary value.</p>
              </>
            ) : (
              <>
                <p className="title text-4xl text-cream">Under the wheel, everything is on the record.</p>
                <button className="btn mt-4 pointer-events-auto" onClick={() => { setStage("world"); if (!useWorld.getState().settings.introSeen) setWalkthrough(true); }}>Skip</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {stage === "world" && (
        <>
          <header className="absolute top-0 inset-x-0 z-10 flex flex-col-reverse md:flex-row items-start justify-between gap-2 p-3 pointer-events-none">
            <div className="pointer-events-auto min-w-0 max-w-full space-y-1">
              <div className="flex items-center gap-2">
                <img src="/brand/squeekchain-mark.png" alt="" width={26} height={26} />
                <h1 className="title text-2xl truncate">{LOCATION_LABEL(location)}</h1>
                {location !== "hub" && location !== "tunnel" && <button className="btn bg-bg/70 py-1" onClick={() => openPanel({ kind: "room", room: location })}>About this room</button>}
              </div>
              <div className="bg-bg/60 px-2 py-1 w-fit"><LiveBadge /></div>
              <SourceBanner compact />
              {found.length > 0 && <p className="label bg-bg/60 px-2 py-1 w-fit">{found.length}/{SEEDS.length} golden seeds</p>}
            </div>
            <nav aria-label="Tools" className="pointer-events-auto flex flex-wrap justify-end gap-1 self-end md:self-auto">
              <button className="btn bg-bg/70" onClick={() => openPanel({ kind: "squeeks" })}>My Squeeks</button>
              <button className="btn bg-bg/70" aria-label="Search history" onClick={() => openPanel({ kind: "search" })}>Search</button>
              <button className="btn bg-bg/70" aria-pressed={settings.sound} aria-label={settings.sound ? "Sound on" : "Sound off"} onClick={() => { const on = !settings.sound; setSettings({ sound: on }); if (on) audio?.enable(settings.volume); else audio?.disable(); }}>{settings.sound ? "♪" : "♪̸"}</button>
              <button className="btn bg-bg/70" aria-label="Settings" onClick={() => openPanel({ kind: "settings" })}>⚙</button>
              <button className="btn bg-bg/70" onClick={() => openPanel({ kind: "account" })}>{me ? me.username : "Sign in"}</button>
            </nav>
          </header>

          <AnimatePresence>
            {prompt && !panel && (
              <motion.div key={prompt.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 bottom-24 z-10 flex justify-end md:justify-center pr-3 md:pr-0 pointer-events-none">
                <button onClick={() => prompt.action()} className="btn btn-gold text-sm shadow-lg whitespace-nowrap pointer-events-auto">
                  <span className="hidden md:inline opacity-70 mr-2">E</span>{prompt.label}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!riding && <Joystick />}
          {riding && <RidePanel />}

          <nav aria-label="Rooms" className={`absolute bottom-3 inset-x-0 z-10 flex justify-center px-2 ${riding ? "hidden" : ""}`}>
            <ul className="flex gap-1 overflow-x-auto scrollbar-thin bg-bg/70 p-1 max-w-full">
              <li><button className={`btn whitespace-nowrap ${location === "hub" ? "border-gold text-gold" : ""}`} onClick={() => requestTravel("hub")}>Burrow</button></li>
              {ROOMS.map((r) => (
                <li key={r.slug}><button aria-current={location === r.slug ? "location" : undefined} className={`btn whitespace-nowrap ${location === r.slug ? "text-ink" : ""}`} style={location === r.slug ? { borderColor: r.color } : undefined} onClick={() => requestTravel(r.slug)}>{r.name.replace("The ", "")}</button></li>
              ))}
            </ul>
          </nav>

          <div className="absolute right-3 bottom-20 z-10 w-[min(84vw,300px)] space-y-1 pointer-events-none" aria-live="polite">
            <AnimatePresence>
              {!panel && toasts.map((t) => (
                <motion.button key={t.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="card w-full text-left p-2 text-sm pointer-events-auto hover:border-gold" onClick={() => { dropToast(t.id); if (t.panel) openPanel(t.panel); }}>
                  <span className="label block">{t.tone === "chain" ? "Just recorded" : t.tone === "measured" ? "Just measured" : "Community"}</span>{t.title}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {walkthrough && !panel && <Walkthrough onDone={() => { setWalkthrough(false); setSettings({ introSeen: true }); }} />}
        </>
      )}

      <AnimatePresence>
        {panel && (
          <motion.aside key="panel" role="dialog" aria-modal="false" aria-label="Details"
            initial={settings.reducedMotion ? false : { opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute z-30 bg-bg/95 border-line select-text overflow-y-auto scrollbar-thin inset-x-0 bottom-0 max-h-[82vh] border-t md:inset-y-0 md:right-0 md:left-auto md:w-[520px] md:max-h-none md:border-l md:border-t-0">
            <div className="sticky top-0 bg-bg/95 backdrop-blur-sm flex items-center justify-between px-4 py-2 border-b border-line z-10">
              {history.length ? <button className="label underline underline-offset-2" onClick={backPanel}>← Back</button> : <span className="label">Squeek Time Machine</span>}
              <button className="btn" onClick={closePanel} aria-label="Close panel">Close</button>
            </div>
            <div className="p-4 sm:p-5"><PanelContent panel={panel} /></div>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
