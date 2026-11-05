"use client";
import { useFrame } from "@react-three/fiber";
import { CREWS, type Emote, type RideCode } from "@stm/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { net, publish, useNet } from "@/lib/multiplayer";
import { useWorld } from "@/lib/store";
import { Hamster } from "./Hamster";
import { hop, hopStep } from "./hop";
import { ROOM_ANGLES, roomCenter, roomIndex } from "./layout";
import { SqueekCharacter } from "./SqueekCharacter";

const LIMIT = { low: 6, medium: 12, high: 20 };
const SQUEEK_LIMIT = { low: 0, medium: 4, high: 8 };
const LANES = [-0.9, 0.9, -0.45, 0.45];
const EMOTE_SHOW = { wave: "\u{1F44B}", squeek: "Squeek!", cheese: "\u{1F9C0}", wheel: "\u{1F3A1}" } as const;
const EMOTE_MS = 2600;

/** Draws text onto a texture. Names are only ever pixels here, so nothing in one can run as code. */
function label(text: string, color: string, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const c = canvas.getContext("2d");
  if (c) {
    c.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const w = Math.min(310, c.measureText(text).width + 24);
    c.fillStyle = "rgba(10,10,20,0.62)";
    c.beginPath();
    c.roundRect(160 - w / 2, 8, w, 64, 18);
    c.fill();
    c.fillStyle = color;
    c.fillText(text, 160, 42, 296);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const emoteTextures = new Map<Emote, THREE.Texture>();
function emoteTexture(e: Emote) {
  let t = emoteTextures.get(e);
  if (!t) {
    t = label(EMOTE_SHOW[e], "#fdfbc8", 46);
    emoteTextures.set(e, t);
  }
  return t;
}

/** Where a rider sits at the bottom of a wheel. Each gets a lane, so a crew doesn't stack up on one spot. */
function wheelSpot(code: 1 | 2, id: number) {
  const hub = code === 1;
  const i = roomIndex("wheel");
  const c = hub ? { x: 0, z: 0 } : roomCenter(i);
  const facing = hub ? Math.PI / 2 : ROOM_ANGLES[i];
  const side = facing + Math.PI / 2;
  const lane = LANES[id % 4];
  return { x: c.x + Math.sin(side) * lane, z: c.z + Math.cos(side) * lane, y: hub ? 1.15 : 0.73, yaw: facing };
}

function Other({ id, showSqueek, height }: { id: number; showSqueek: boolean; height: number }) {
  const group = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleMat = useRef<THREE.SpriteMaterial>(null);
  const speed = useRef(0);
  const shownEmote = useRef<Emote | null>(null);
  const info = net.players.get(id);
  const crew = CREWS.find((c) => c.slug === info?.crew);
  const name = info?.name ?? "";
  const tag = useMemo(() => label(name, crew?.color ?? "#e8e4d8", 34), [name, crew?.color]);
  useEffect(() => () => tag.dispose(), [tag]);
  useFrame((_, rawDt) => {
    const p = net.players.get(id);
    const g = group.current;
    if (!p || !g) return;
    const dt = Math.min(rawDt, 0.1);
    if (p.r) {
      const at = wheelSpot(p.r, id);
      g.position.set(at.x, at.y, at.z);
      g.rotation.set(0, at.yaw, 0);
      speed.current = Math.min(14, (net.wheels[p.r][0] / 100) * 8);
      p.vx = p.x;
      p.vz = p.z;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      if (Math.hypot(p.x - p.vx, p.z - p.vz) > 8) {
        p.vx = p.x;
        p.vz = p.z;
      } else {
        p.vx += (p.x - p.vx) * k;
        p.vz += (p.z - p.vz) * k;
      }
      p.vyaw += Math.atan2(Math.sin(p.yaw - p.vyaw), Math.cos(p.yaw - p.vyaw)) * k;
      [p.hopY, p.hopV] = hopStep(p.hopY, p.hopV, dt);
      g.position.set(p.vx, p.hopY, p.vz);
      g.rotation.set(0, p.vyaw, 0);
      speed.current += (p.s - speed.current) * k;
    }
    const b = bubble.current;
    const m = bubbleMat.current;
    if (!b || !m) return;
    const age = performance.now() - p.emoteAt;
    b.visible = !!p.emote && age < EMOTE_MS;
    if (b.visible && p.emote) {
      if (shownEmote.current !== p.emote) {
        shownEmote.current = p.emote;
        m.map = emoteTexture(p.emote);
        m.needsUpdate = true;
      }
      b.position.y = height + 0.55 + (age / EMOTE_MS) * 0.35;
    }
  });
  return (
    <group ref={group}>
      {showSqueek && info?.squeekId
        ? <SqueekCharacter tokenId={info.squeekId} speedRef={speed} />
        : <Hamster speedRef={speed} crewColor={crew?.color} stars={info?.squeekLevel ?? 0} />}
      <sprite position={[0, height, 0]} scale={[2.4, 0.6, 1]}><spriteMaterial map={tag} transparent depthWrite={false} toneMapped={false} /></sprite>
      <sprite ref={bubble} visible={false} scale={[2.4, 0.6, 1]}><spriteMaterial ref={bubbleMat} transparent depthWrite={false} toneMapped={false} /></sprite>
    </group>
  );
}

/** Your own emote, so you can see what the others see. */
function SelfBubble({ player }: { player: React.RefObject<{ x: number; z: number }> }) {
  const bubble = useRef<THREE.Sprite>(null);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const shown = useRef<Emote | null>(null);
  useFrame(() => {
    const b = bubble.current;
    if (!b || !mat.current) return;
    const age = performance.now() - net.selfEmoteAt;
    b.visible = !!net.selfEmote && age < EMOTE_MS && !useWorld.getState().ride;
    if (!b.visible || !net.selfEmote) return;
    if (shown.current !== net.selfEmote) {
      shown.current = net.selfEmote;
      mat.current.map = emoteTexture(net.selfEmote);
      mat.current.needsUpdate = true;
    }
    b.position.set(player.current.x, 2.2 + hop.y + (age / EMOTE_MS) * 0.35, player.current.z);
  });
  return <sprite ref={bubble} visible={false} scale={[2.4, 0.6, 1]}><spriteMaterial ref={mat} transparent depthWrite={false} toneMapped={false} /></sprite>;
}

/** Everyone else in the burrow. Only the nearest are drawn, so a busy room can't sink a slow device. */
export function OtherPlayers({ player, quality }: { player: React.RefObject<{ x: number; z: number; yaw: number; speed: number }>; quality: "low" | "medium" | "high" }) {
  const list = useNet((s) => s.roster);
  const [shown, setShown] = useState<number[]>([]);
  const timer = useRef(0);
  const choose = () => {
    const me = player.current;
    const next = [...net.players.values()]
      .map((p) => ({ id: p.id, d: Math.hypot(p.x - me.x, p.z - me.z) }))
      .filter((p) => p.d < 70)
      .sort((a, b) => a.d - b.d)
      .slice(0, LIMIT[quality])
      .map((p) => p.id)
      .sort((a, b) => a - b);
    setShown((old) => (old.length === next.length && old.every((v, i) => v === next[i]) ? old : next));
  };
  useEffect(choose, [list, quality]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const where = useWorld.getState().ride;
    const code: RideCode = where === "hub" ? 1 : where === "wheel" ? 2 : 0;
    publish(player.current, code, performance.now());
    timer.current += dt;
    if (timer.current > 1) {
      timer.current = 0;
      choose();
    }
  });
  let squeeks = 0;
  return (
    <>
      {shown.map((id) => {
        const hasSqueek = !!net.players.get(id)?.squeekId;
        const showSqueek = hasSqueek && squeeks < SQUEEK_LIMIT[quality];
        if (showSqueek) squeeks++;
        return <Other key={id} id={id} showSqueek={showSqueek} height={showSqueek ? 2.2 : 1.6} />;
      })}
      <SelfBubble player={player} />
    </>
  );
}
