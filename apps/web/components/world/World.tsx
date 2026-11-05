"use client";
import { AdaptiveDpr, PerformanceMonitor, Sparkles, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { ROOMS, formatInt, rpmFromMilli } from "@stm/shared";
import gsap from "gsap";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { audio } from "@/lib/audio";
import { useWorld, type Panel } from "@/lib/store";
import { SEEDS } from "../panels/discoveries";
import { Hamster } from "./Hamster";
import { ROOM_ANGLES, arrivalPoint, isOpenFloor, isWalkable, locate, roomCenter, roomIndex, roomPoint, step } from "./layout";
import { Portals, Shells, WallDots } from "./Shell";
import { GiantWheel } from "./Wheel";
import { input } from "./input";
import { WORLD_FONT } from "./rooms/common";

const ROOM_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<{ index: number }>>> = {
  beginning: lazy(() => import("./rooms/Beginning")),
  timeline: lazy(() => import("./rooms/Timeline")),
  wheel: lazy(() => import("./rooms/WheelRoom")),
  vault: lazy(() => import("./rooms/Vault")),
  evolution: lazy(() => import("./rooms/Evolution")),
  community: lazy(() => import("./rooms/Community")),
  future: lazy(() => import("./rooms/Future")),
};

const SPEED = 7.5;
gsap.ticker.lagSmoothing(0);

interface Player { x: number; z: number; yaw: number; speed: number; target: THREE.Vector3 | null; snap: boolean }

function usePlayer() {
  return useRef<Player>({ x: 0, z: 17, yaw: Math.PI, speed: 0, target: null, snap: false });
}

/** Rooms load only when you get close, and unload when you've gone. */
function RoomsNear({ player }: { player: React.RefObject<Player> }) {
  const [near, setNear] = useState<Set<string>>(new Set());
  const travel = useWorld((s) => s.travel);
  const wait = useRef(0);
  useFrame((_, dt) => {
    wait.current -= dt;
    if (wait.current > 0) return;
    wait.current = 0.4;
    const p = player.current;
    const next = new Set<string>();
    ROOMS.forEach((r, i) => {
      const c = roomCenter(i);
      if (Math.hypot(p.x - c.x, p.z - c.z) < 44) next.add(r.slug);
    });
    if (travel && travel !== "hub") next.add(travel);
    if (next.size !== near.size || [...next].some((s) => !near.has(s))) setNear(next);
  });
  return (
    <>
      {ROOMS.map((r, i) => {
        if (!near.has(r.slug)) return null;
        const C = ROOM_COMPONENTS[r.slug];
        const c = roomCenter(i);
        return (
          <group key={r.slug} position={[c.x, 0, c.z]} rotation={[0, ROOM_ANGLES[i] + Math.PI, 0]}>
            <Suspense fallback={null}><C index={i} /></Suspense>
          </group>
        );
      })}
    </>
  );
}

/** A warm light that follows the visitor and one that follows the room they're in. A fixed count, so moving never recompiles materials. */
function RoamingLights({ player }: { player: React.RefObject<Player> }) {
  const near = useRef<THREE.PointLight>(null);
  const room = useRef<THREE.PointLight>(null);
  const location = useWorld((s) => s.location);
  const key = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const { x, z } = player.current;
    near.current?.position.set(x, 3.6, z);
    if (key.current) {
      key.current.position.set(x + 14, 34, z + 10);
      key.current.target.position.set(x, 0, z);
      key.current.target.updateMatrixWorld();
    }
  });
  useEffect(() => {
    if (!room.current) return;
    const idx = ROOMS.findIndex((r) => r.slug === location);
    if (idx >= 0) {
      const c = roomCenter(idx);
      room.current.position.set(c.x, 9, c.z);
      room.current.color.set(ROOMS[idx].color);
      room.current.intensity = 130;
    } else if (location === "hub") {
      room.current.position.set(0, 13, 8);
      room.current.color.set("#ffb45e");
      room.current.intensity = 190;
    }
  }, [location]);
  return (
    <>
      <hemisphereLight args={["#ffd9a8", "#20140c", 0.55]} />
      <pointLight ref={near} color="#ffbf80" intensity={28} distance={24} decay={1.6} />
      <pointLight ref={room} color="#ffb45e" intensity={190} distance={60} decay={1.5} position={[0, 13, 8]} />
      <directionalLight ref={key} castShadow color="#ffdcae" intensity={1.1} position={[18, 34, 12]} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0006} shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34} shadow-camera-near={1} shadow-camera-far={90} />
    </>
  );
}

function Controller({ player, intro }: { player: React.RefObject<Player>; intro: React.RefObject<{ active: boolean; progress: number }> }) {
  const { camera } = useThree();
  const avatar = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const cam = useRef({ yaw: Math.PI, pitch: 0.3, dist: 11 });
  const camPos = useRef(new THREE.Vector3(0, 7, 28));
  const look = useRef(new THREE.Vector3(0, 2, 14));
  const marker = useRef<THREE.Mesh>(null);
  const travel = useWorld((s) => s.travel);
  const requestTravel = useWorld((s) => s.requestTravel);
  const setLocation = useWorld((s) => s.setLocation);
  const reduced = useWorld((s) => s.settings.reducedMotion);
  const fade = useRef<HTMLDivElement | null>(null);
  const idle = useRef(0);

  useEffect(() => {
    if (!travel) return;
    const land = arrivalPoint(travel);
    const go = () => {
      player.current.x = land.x;
      player.current.z = land.z;
      player.current.yaw = land.yaw;
      player.current.target = null;
      player.current.snap = true;
      requestTravel(null);
    };
    audio?.portal();
    if (reduced) return go();
    const el = (fade.current ??= document.getElementById("travel-fade") as HTMLDivElement | null);
    if (!el) return go();
    // The move runs on a timer, so a slow or throttled device can't leave the visitor stuck behind the fade.
    gsap.timeline().to(el, { opacity: 1, duration: 0.3, ease: "power1.in" }).to(el, { opacity: 0, duration: 0.55, ease: "power1.out" });
    const timer = setTimeout(go, 300);
    return () => clearTimeout(timer);
  }, [travel, player, requestTravel, reduced]);

  useEffect(() => {
    input.onOrbit = (dx, dy) => {
      cam.current.yaw -= dx * 0.005;
      cam.current.pitch = THREE.MathUtils.clamp(cam.current.pitch + dy * 0.004, 0.14, 1.15);
    };
    input.onZoom = (d) => {
      cam.current.dist = THREE.MathUtils.clamp(cam.current.dist + d * 0.012, 5, 24);
    };
    return () => {
      input.onOrbit = input.onZoom = null;
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = player.current;
    if (p.snap) {
      p.snap = false;
      cam.current.yaw = p.yaw;
      camPos.current.set(p.x - Math.sin(p.yaw) * 9, 6, p.z - Math.cos(p.yaw) * 9);
      look.current.set(p.x, 1.1, p.z);
    }
    let mx = input.axisX + (input.keys.has("KeyD") || input.keys.has("ArrowRight") ? 1 : 0) - (input.keys.has("KeyA") || input.keys.has("ArrowLeft") ? 1 : 0);
    let mz = input.axisY + (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) - (input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0);
    const manual = Math.hypot(mx, mz) > 0.05;
    let vx = 0, vz = 0;
    if (intro.current.active) {
      mx = mz = 0;
    } else if (manual) {
      p.target = null;
      const len = Math.max(1, Math.hypot(mx, mz));
      mx /= len; mz /= len;
      const cy = Math.cos(cam.current.yaw), sy = Math.sin(cam.current.yaw);
      // Forward is where the camera looks, and right is its right hand.
      vx = -mz * sy - mx * cy;
      vz = -mz * cy + mx * sy;
    } else if (p.target) {
      const dx = p.target.x - p.x, dz = p.target.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.4) p.target = null;
      else { vx = dx / d; vz = dz / d; }
    }
    const moving = Math.hypot(vx, vz) > 0.01;
    const before = { x: p.x, z: p.z };
    if (moving) {
      const n = step(p, vx * SPEED * dt, vz * SPEED * dt);
      p.x = n.x; p.z = n.z;
      if (n.x === before.x && n.z === before.z) p.target = null;
      const want = Math.atan2(vx, vz);
      p.yaw += Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)) * Math.min(1, dt * 11);
    }
    const realSpeed = Math.hypot(p.x - before.x, p.z - before.z) / Math.max(dt, 0.0001);
    p.speed += (realSpeed - p.speed) * Math.min(1, dt * 10);
    speedRef.current = p.speed;
    if (avatar.current) {
      avatar.current.position.set(p.x, 0, p.z);
      avatar.current.rotation.y = p.yaw;
      avatar.current.visible = !intro.current.active || intro.current.progress > 0.55;
    }
    if (marker.current) {
      marker.current.visible = !!p.target;
      if (p.target) marker.current.position.set(p.target.x, 0.05, p.target.z);
    }
    setLocation(locate(p));

    const c = cam.current;
    if (intro.current.active) {
      const t = intro.current.progress;
      const e = t * t * (3 - 2 * t);
      idle.current += dt * 0.035;
      const a = Math.PI * 0.85 + e * 0.9 + idle.current;
      const r = 34 - e * 15;
      camera.position.set(Math.sin(a) * r, 22 - e * 13, Math.cos(a) * r);
      camera.lookAt(0, 6.5 - e * 3.5, 0);
      camPos.current.copy(camera.position);
      look.current.set(0, 3, 0);
      return;
    }
    if (moving && !input.dragging && manual === false) {
      c.yaw += Math.atan2(Math.sin(p.yaw - c.yaw), Math.cos(p.yaw - c.yaw)) * dt * 0.8;
    }
    const horizontal = Math.cos(c.pitch) * c.dist;
    let tx = p.x - Math.sin(c.yaw) * horizontal;
    let tz = p.z - Math.cos(c.yaw) * horizontal;
    // Shorten the boom until the camera sits in open space, so it never ends up in solid earth.
    for (let k = 0; k < 8 && !isOpenFloor({ x: tx, z: tz }); k++) {
      tx = p.x + (tx - p.x) * 0.8;
      tz = p.z + (tz - p.z) * 0.8;
    }
    const ty = 1.2 + Math.sin(c.pitch) * c.dist;
    const smooth = reduced ? 1 : 1 - Math.exp(-dt * 5.5);
    camPos.current.lerp(new THREE.Vector3(tx, ty, tz), smooth);
    look.current.lerp(new THREE.Vector3(p.x, 1.9, p.z), smooth);
    camera.position.copy(camPos.current);
    camera.lookAt(look.current);
  });
  return (
    <>
      <group ref={avatar}><Hamster speedRef={speedRef} scale={1} /></group>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.3, 0.42, 24]} /><meshBasicMaterial color="#f2c230" transparent opacity={0.85} toneMapped={false} /></mesh>
    </>
  );
}

/** Finds what's close enough to use and offers it. E, Enter or tap all do the same thing. */
function Proximity({ player }: { player: React.RefObject<Player> }) {
  const setPrompt = useWorld((s) => s.setPrompt);
  const open = useWorld((s) => s.openPanel);
  const markFound = useWorld((s) => s.markFound);
  const last = useRef<string | null>(null);
  const spots = useMemo(() => {
    const list: { key: string; x: number; z: number; r: number; label: string; action: () => void }[] = [
      { key: "wheel", x: 0, z: 0, r: 11, label: "Inspect WHEELY9000", action: () => open({ kind: "room", room: "wheel" }) },
    ];
    ROOMS.forEach((room, i) => {
      const c = roomCenter(i);
      list.push({ key: room.slug, x: c.x, z: c.z, r: 15.5, label: `Explore ${room.name}`, action: () => open({ kind: "room", room: room.slug }) });
    });
    SEEDS.forEach((s) => {
      const i = s.room === "hub" ? -1 : ROOMS.findIndex((r) => r.slug === s.room);
      const at = i < 0 ? { x: s.at[0], z: s.at[1] } : roomPoint(i, s.at[0], s.at[1]);
      list.unshift({ key: s.slug, x: at.x, z: at.z, r: 2.4, label: "Pick up the golden seed", action: () => { markFound(s.slug); audio?.discovery(); open({ kind: "discovery", slug: s.slug }); } });
    });
    return list;
  }, [open, markFound]);
  useFrame(() => {
    const p = player.current;
    const hit = spots.find((s) => {
      if (s.key.startsWith("seed-") && useWorld.getState().found.includes(s.key)) return false;
      return Math.hypot(p.x - s.x, p.z - s.z) < s.r;
    });
    const key = hit?.key ?? null;
    if (key !== last.current) {
      last.current = key;
      setPrompt(hit ? { label: hit.label, action: hit.action } : null);
    }
  });
  return null;
}

function Seeds() {
  const found = useWorld((s) => s.found);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => { c.rotation.y = clock.elapsedTime * 1.3 + i; c.position.y = 0.55 + Math.sin(clock.elapsedTime * 1.8 + i) * 0.09; });
  });
  return (
    <group ref={group}>
      {SEEDS.filter((s) => !found.includes(s.slug)).map((s) => {
        const i = s.room === "hub" ? -1 : ROOMS.findIndex((r) => r.slug === s.room);
        const at = i < 0 ? { x: s.at[0], z: s.at[1] } : roomPoint(i, s.at[0], s.at[1]);
        return <mesh key={s.slug} position={[at.x, 0.55, at.z]} scale={[0.17, 0.27, 0.17]}><sphereGeometry args={[1, 10, 10]} /><meshStandardMaterial color="#f2c230" emissive="#f2c230" emissiveIntensity={2.2} toneMapped={false} /></mesh>;
      })}
    </group>
  );
}

/** Residents with no purpose but to be cosy. They're scenery, and nothing they do reports data. */
function Residents() {
  const list = useMemo(() => [0, 1, 2, 3, 4].map((i) => ({ a: (i / 5) * Math.PI * 2 + 0.3, r: 13 + (i % 3) * 3, s: 0.12 + i * 0.015, scale: 0.55 + (i % 3) * 0.08 })), []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const speed = useRef(1.2);
  useFrame(({ clock }) => {
    list.forEach((n, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = n.a + clock.elapsedTime * n.s;
      g.position.set(Math.sin(a) * n.r, 0, Math.cos(a) * n.r);
      g.rotation.y = a + Math.PI / 2;
    });
  });
  return <>{list.map((n, i) => <group key={i} ref={(g) => { refs.current[i] = g; }}><Hamster speedRef={speed} scale={n.scale} /></group>)}</>;
}

/** The sign on the wheel. It says what's measured, or says it doesn't know. */
function WheelSign() {
  const live = useWorld((s) => s.live);
  const height = useWorld((s) => s.world?.core?.blockHeight ?? s.world?.live?.settled?.blockHeight ?? null);
  const fresh = live && (live.freshness === "online" || live.freshness === undefined);
  const text = !live ? "WAITING FOR A READING" : !fresh ? "NO FRESH READING" : (live.rpmMilli ?? 0) > 0 ? `RUNNING  ${rpmFromMilli(live.rpmMilli!)} RPM` : "THE WHEEL IS STILL";
  return (
    <group position={[0, 15.4, 0]}>
      <Text font={WORLD_FONT} fontSize={1.15} color="#f2c230" anchorX="center" anchorY="middle" letterSpacing={0.05} rotation={[0, Math.PI, 0]} position={[0, 0, -0.1]}>{text}<meshBasicMaterial color="#f2c230" toneMapped={false} /></Text>
      <Text font={WORLD_FONT} fontSize={1.15} color="#f2c230" anchorX="center" anchorY="middle" letterSpacing={0.05} position={[0, 0, 0.1]}>{text}<meshBasicMaterial color="#f2c230" toneMapped={false} /></Text>
      {height && <Text font={WORLD_FONT} fontSize={0.7} color="#fdfbc8" anchorX="center" anchorY="middle" position={[0, -1.15, 0.1]}>{`SQUEEK BLOCK ${formatInt(height)}`}<meshBasicMaterial color="#fdfbc8" toneMapped={false} /></Text>}
    </group>
  );
}

function Scene({ intro, quality }: { intro: React.RefObject<{ active: boolean; progress: number }>; quality: "low" | "medium" | "high" }) {
  const player = usePlayer();
  const clickToMove = useWorld((s) => s.settings.clickToMove);
  const openPanel = useWorld((s) => s.openPanel);
  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || !clickToMove) return;
    const obj = e.object as THREE.Object3D;
    if (obj.name !== "floor") return;
    const pt = e.point;
    if (isWalkable({ x: pt.x, z: pt.z })) player.current.target = pt.clone();
  };
  return (
    <>
      <color attach="background" args={["#090706"]} />
      <fog attach="fog" args={["#120c08", 34, 92]} />
      <RoamingLights player={player} />
      <group onClick={onFloor}><Shells /></group>
      <WallDots />
      <Portals />
      <GiantWheel onClick={() => openPanel({ kind: "room", room: "wheel" })} />
      <WheelSign />
      <RoomsNear player={player} />
      <Seeds />
      {quality !== "low" && <Residents />}
      {quality !== "low" && <Sparkles count={quality === "high" ? 120 : 60} scale={[46, 12, 46]} position={[0, 6, 0]} size={2.2} speed={0.18} opacity={0.5} color="#ffcf8a" />}
      <Controller player={player} intro={intro} />
      <Proximity player={player} />
      <TravelFromUrl player={player} />
      {quality === "high" && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.28} darkness={0.62} />
        </EffectComposer>
      )}
    </>
  );
}

function TravelFromUrl({ player }: { player: React.RefObject<Player> }) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const moment = q.get("moment");
    const block = q.get("block");
    const room = q.get("room");
    const go = (slug: Parameters<typeof arrivalPoint>[0]) => {
      const land = arrivalPoint(slug);
      player.current.x = land.x;
      player.current.z = land.z;
      player.current.yaw = land.yaw;
      player.current.snap = true;
    };
    const show = (panel: Panel) => useWorld.setState({ panel, history: [] });
    if (moment) { go("timeline"); show({ kind: "event", id: moment }); }
    else if (block) { go("vault"); show({ kind: "block", height: block }); }
    else if (room && roomIndex(room as never) >= 0) { go(room as never); show({ kind: "room", room: room as never }); }
  }, [player]);
  return null;
}

export default function World({ stage, onContextLost }: { stage: "title" | "flying" | "world"; onContextLost: () => void }) {
  const introActive = stage !== "world";
  const setting = useWorld((s) => s.settings.quality);
  const [auto, setAuto] = useState<"low" | "medium" | "high">(() => (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "low" : "high"));
  const quality = setting === "auto" ? auto : setting;
  const intro = useRef({ active: introActive, progress: introActive ? 0 : 1 });
  const reduced = useWorld((s) => s.settings.reducedMotion);
  useEffect(() => {
    intro.current.active = introActive;
    if (!introActive) {
      intro.current.progress = 1;
      return;
    }
    if (reduced) { intro.current.active = false; intro.current.progress = 1; return; }
    if (stage === "title") return;
    const tween = gsap.to(intro.current, { progress: 1, duration: 7, ease: "none" });
    return () => { tween.kill(); };
  }, [introActive, reduced, stage]);
  return (
    <Canvas
      className="!absolute inset-0"
      shadows={quality === "high"}
      dpr={quality === "low" ? [0.75, 1.1] : quality === "medium" ? [1, 1.4] : [1, 1.8]}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 52, near: 0.2, far: 170, position: [0, 18, 34] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onContextLost(); });
      }}
    >
      <PerformanceMonitor onDecline={() => setAuto((q) => (q === "high" ? "medium" : "low"))} onIncline={() => undefined} />
      <AdaptiveDpr pixelated={false} />
      <Suspense fallback={null}><Scene intro={intro} quality={quality} /></Suspense>
    </Canvas>
  );
}
