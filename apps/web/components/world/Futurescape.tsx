"use client";
import { ROOMS, formatInt, formatSqk, mmToKm, rpmFromMilli } from "@stm/shared";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { wallClock } from "./architecture";
import { HUB_R, ROOM_ANGLES } from "./layout";

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

const CONDUIT_FRAG = `
uniform float uTime; uniform float uPulse; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float flow = pow(fract(vUv.y*2. - uTime*(.05+uPulse*1.2)), 18.);
  gl_FragColor = vec4(uColor, (.2+flow*.8)*smoothstep(0.,.12,vUv.y)*smoothstep(1.,.88,vUv.y));
  #include <colorspace_fragment>
}`;

/** A hairline of light in the floor leading to each door. It runs faster while someone's running. */
export function FloorLines({ quality }: { quality: "low" | "medium" | "high" }) {
  const reduced = useWorld((s) => s.settings.reducedMotion);
  const conduit = useMemo(() => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: CONDUIT_FRAG, transparent: true, depthWrite: false, toneMapped: false, uniforms: { uTime: wallClock.uTime, uPulse: wallClock.uPulse, uColor: { value: new THREE.Color("#c9a24a") } } }), []);
  useEffect(() => () => conduit.dispose(), [conduit]);
  if (quality === "low" || reduced) return null;
  return <>{ROOM_ANGLES.map((a, i) => <mesh key={i} material={conduit} position={[Math.sin(a) * 16.2, 0.02, Math.cos(a) * 16.2]} rotation={[-Math.PI / 2, 0, a + Math.PI]}><planeGeometry args={[0.05, 17.4]} /></mesh>)}</>;
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, d: ScreenData) => void;
interface ScreenData {
  world: ReturnType<typeof useWorld.getState>["world"];
  live: ReturnType<typeof useWorld.getState>["live"];
  events: { title: string; occurredAt: string }[];
  dig: { chamber?: { number: number; progressBps: number }; crews?: { name: string; points: number; color: string }[]; contributions?: { kind: string; username: string; displayName: string | null }[]; shift?: { open?: { index: number } } } | null;
}

const SCALE = 1.5;
const css = (v: string, f: string) => (typeof document === "undefined" ? f : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f);

const INK = "#efeadf";
const MUTED = "#8a8579";

/** The drawing coordinates stay 640 by 260, and the canvas is sharper than that. */
function frame(g: CanvasRenderingContext2D, w: number, h: number, title: string, color: string) {
  g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const glass = g.createLinearGradient(0, 0, 0, h);
  glass.addColorStop(0, "#0e0e11");
  glass.addColorStop(1, "#08080a");
  g.fillStyle = glass;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.fillRect(28, 30, 5, 5);
  g.fillStyle = MUTED;
  g.font = `15px ${css("--font-data", "monospace")}, monospace`;
  g.textBaseline = "top";
  try { (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "2px"; } catch {}
  g.fillText(title, 44, 25);
  try { (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px"; } catch {}
  g.fillStyle = "rgba(255,255,255,.07)";
  g.fillRect(28, 52, w - 56, 1);
}
const big = (g: CanvasRenderingContext2D, text: string, y: number, color = INK, size = 88) => {
  g.fillStyle = color === INK ? INK : INK;
  g.font = `500 ${Math.min(size, 88)}px ${css("--font-display", "sans-serif")}, sans-serif`;
  g.fillText(text, 26, y + 8, 588);
};
const small = (g: CanvasRenderingContext2D, text: string, y: number, color = MUTED) => {
  g.fillStyle = color;
  g.font = `17px ${css("--font-data", "monospace")}, monospace`;
  g.fillText(text.slice(0, 54), 28, y + 6);
};

/** Every screen shows real data, or says it doesn't know. Nothing here is decoration pretending to be data. */
const SCREENS: Draw[] = [
  (g, w, h, d) => {
    frame(g, w, h, "WHEELY9000 · MEASURED", "#ffc048");
    const m = d.live;
    const fresh = m && (m.freshness === "online" || m.freshness === undefined);
    big(g, !m ? "UNKNOWN" : !fresh ? "NO READING" : (m.rpmMilli ?? 0) > 0 ? `${rpmFromMilli(m.rpmMilli!)} RPM` : "STILL", 70, "#ffc048");
    small(g, m?.distanceMm != null ? `${mmToKm(m.distanceMm)} km today` : "Distance unknown", 205);
  },
  (g, w, h, d) => {
    frame(g, w, h, "SQUEEK BLOCK HEIGHT", "#35d07f");
    const c = d.world?.core;
    big(g, c ? formatInt(c.blockHeight) : "UNKNOWN", 70, "#35d07f");
    small(g, c ? `Difficulty ${formatInt(c.workPerThousandBlocks)} · confirmed` : "Waiting for the chain", 205);
  },
  (g, w, h, d) => {
    frame(g, w, h, "LATEST ON THE RECORD", "#a8baff");
    if (!d.events.length) return small(g, "Nothing to show yet", 90);
    d.events.slice(0, 4).forEach((e, i) => {
      g.fillStyle = i === 0 ? INK : MUTED;
      g.font = `500 28px ${css("--font-display", "sans-serif")}, sans-serif`;
      g.fillText(e.title.slice(0, 40), 28, 72 + i * 44, 584);
    });
  },
  (g, w, h, d) => {
    frame(g, w, h, "THE GREAT DIG", "#ff8a3d");
    const c = d.dig?.chamber;
    big(g, c ? `CHAMBER ${c.number}` : "UNKNOWN", 66, "#ff8a3d", 96);
    if (c) {
      g.fillStyle = "rgba(255,255,255,.09)";
      g.fillRect(28, 186, w - 56, 3);
      g.fillStyle = "#ff8a3d";
      g.fillRect(28, 186, ((w - 56) * c.progressBps) / 10000, 3);
      small(g, `${(c.progressBps / 100).toFixed(1)}% dug`, 204);
    }
  },
  (g, w, h, d) => {
    frame(g, w, h, "CREW STANDINGS", "#f08fb0");
    const crews = [...(d.dig?.crews ?? [])].sort((a, b) => b.points - a.points);
    if (!crews.length) return small(g, "Unknown", 90);
    crews.forEach((c, i) => {
      g.fillStyle = INK;
      g.font = `500 28px ${css("--font-display", "sans-serif")}, sans-serif`;
      g.fillText(`${i + 1}  ${c.name}`, 28, 72 + i * 44);
      g.fillStyle = c.color;
      g.textAlign = "right";
      g.fillText(formatInt(c.points), w - 28, 72 + i * 44);
      g.textAlign = "left";
    });
  },
  (g, w, h, d) => {
    frame(g, w, h, "SQK ISSUED BY MINING", "#f2c230");
    const s = d.world?.economy?.supply;
    big(g, s ? formatSqk(s.miningMintedBaseUnits, 0) : "UNKNOWN", 74, "#f2c230", 92);
    small(g, "Sepolia testnet. No monetary value.", 205);
  },
  (g, w, h, d) => {
    frame(g, w, h, "SQUEEKS ALIVE", "#fdfbc8");
    const n = d.world?.economy?.nft;
    big(g, n ? formatInt(n.live) : "UNKNOWN", 70, "#fdfbc8");
    small(g, n ? `${formatInt(n.burned)} burned by merging` : "Waiting for the chain", 205);
  },
  (g, w, h, d) => {
    frame(g, w, h, "ON-CHAIN CONTRIBUTORS", "#5b7cfa");
    const list = d.dig?.contributions ?? [];
    if (!list.length) {
      g.fillStyle = INK;
      g.font = `500 44px ${css("--font-display", "sans-serif")}, sans-serif`;
      g.fillText("BE THE FIRST", 28, 82);
      return small(g, "Find the checkpoint lever", 150);
    }
    list.slice(0, 4).forEach((c, i) => {
      g.fillStyle = MUTED;
      g.font = `500 28px ${css("--font-display", "sans-serif")}, sans-serif`;
      g.fillText(`${c.displayName ?? c.username}: ${c.kind}`.slice(0, 38), 28, 72 + i * 44, 584);
    });
  },
];

const SCREEN_R = HUB_R + 0.6 - 0.06;
const SCREEN_W = 5.7;
const SCREEN_H = 2.32;
const SCREEN_Y = 5.36;

export function WallScreens({ quality }: { quality: "low" | "medium" | "high" }) {
  const digBump = useWorld((s) => s.digBump);
  const eventBump = useWorld((s) => s.eventBump);
  const screens = useMemo(() => {
    const show = quality === "low" ? SCREENS.filter((_, i) => i % 2 === 0) : SCREENS;
    return show.map((draw) => {
      const canvas = document.createElement("canvas");
      canvas.width = 640 * SCALE;
      canvas.height = 260 * SCALE;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      // The screens curve with the wall and are seen from inside it, so the picture is flipped to read properly.
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = -1;
      return { draw, canvas, texture };
    });
  }, [quality]);
  const data = useRef<ScreenData>({ world: null, live: null, events: [], dig: null });
  useEffect(() => {
    let live = true;
    const paint = () => screens.forEach((s) => {
      const g = s.canvas.getContext("2d");
      if (g) s.draw(g, 640, 260, data.current);
      s.texture.needsUpdate = true;
    });
    const refresh = async () => {
      const [events, dig] = await Promise.all([
        api<{ events: { title: string; occurredAt: string }[] }>("/events?limit=4&minSignificance=2").catch(() => null),
        api<ScreenData["dig"]>("/dig").catch(() => null),
      ]);
      if (!live) return;
      const st = useWorld.getState();
      data.current = { world: st.world, live: st.live, events: events?.events ?? data.current.events, dig: dig ?? data.current.dig };
      paint();
    };
    void refresh();
    const t = setInterval(refresh, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [screens, digBump, eventBump]);
  useEffect(() => () => screens.forEach((s) => s.texture.dispose()), [screens]);
  return (
    <>
      {screens.map((s, i) => {
        const step = (Math.PI * 2) / ROOMS.length;
        const a = ROOM_ANGLES[(i * (quality === "low" ? 2 : 1)) % ROOMS.length] + step / 2;
        const arc = SCREEN_W / SCREEN_R;
        return (
          <group key={i}>
            <mesh position={[0, SCREEN_Y, 0]}>
              <cylinderGeometry args={[SCREEN_R, SCREEN_R, SCREEN_H, 24, 1, true, a - arc / 2, arc]} />
              <meshBasicMaterial map={s.texture} side={THREE.BackSide} toneMapped={false} />
            </mesh>
            <mesh position={[0, SCREEN_Y, 0]}>
              <cylinderGeometry args={[SCREEN_R + 0.02, SCREEN_R + 0.02, SCREEN_H + 0.12, 24, 1, true, a - (arc * 1.015) / 2, arc * 1.015]} />
              <meshStandardMaterial color="#2a241e" metalness={0.6} roughness={0.4} side={THREE.BackSide} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
