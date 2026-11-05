"use client";
import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CREWS } from "@stm/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { audio } from "@/lib/audio";
import { useWorld } from "@/lib/store";
import type { DigState } from "../../panels/dig";
import { clickable, RoomSign, useSolid, useSpots, WORLD_FONT } from "./common";

const MAX_RINGS = 40;
const BOARD: [number, number] = [0, -11.6];
const crewAngle = (i: number) => -1.9 + i * (3.8 / (CREWS.length - 1));
const crewAt = (i: number): [number, number] => [Math.sin(crewAngle(i)) * 11.8, -Math.cos(crewAngle(i)) * 11.8];

/**
 * The shaft in the middle really is the dig. One lit ring per chamber broken through, sinking
 * out of sight, and an arc of light for how far real settled work has got through the next one.
 */
function Shaft({ broken, progress }: { broken: number; progress: number }) {
  const rings = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    const m = rings.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const shown = Math.min(broken, MAX_RINGS);
    for (let i = 0; i < shown; i++) {
      const t = (i + 1) / (shown + 1);
      d.position.set(0, 0.03 + t * 0.012, 0);
      d.rotation.set(-Math.PI / 2, 0, 0);
      const s = 1 - t * 0.86;
      d.scale.set(s, s, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set("#ff8a3d").multiplyScalar(1 - t * 0.75));
    }
    m.count = shown;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [broken]);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 1.6) * 0.3;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><circleGeometry args={[4.6, 48]} /><meshBasicMaterial color="#050302" /></mesh>
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_RINGS]} frustumCulled={false}>
        <ringGeometry args={[4.3, 4.45, 48]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}><ringGeometry args={[4.75, 5.05, 64]} /><meshStandardMaterial color="#2a1a10" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.08, 0]}><ringGeometry args={[4.78, 5.02, 64, 1, 0, Math.max(0.01, progress) * Math.PI * 2]} /><meshStandardMaterial ref={glow} color="#ff8a3d" emissive="#ff8a3d" emissiveIntensity={1.5} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return <mesh key={i} position={[Math.sin(a) * 5.4, 1.5, Math.cos(a) * 5.4]} rotation={[0, a, Math.PI * 0.06 * (i % 2 ? 1 : -1)]} castShadow><boxGeometry args={[0.3, 3, 0.3]} /><meshStandardMaterial color="#4a3423" roughness={1} /></mesh>;
      })}
    </group>
  );
}

export default function DigRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.digBump);
  const setDigMe = useWorld((s) => s.setDigMe);
  const [dig, setDig] = useState<DigState | null>(null);
  useEffect(() => {
    let live = true;
    api<DigState>("/dig").then((d) => {
      if (!live || d.status !== "available") return;
      setDig(d);
      setDigMe(d.me ? { crew: d.me.crew, squeekLevel: d.me.squeekLevel } : null);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [bump, setDigMe]);
  const maxPoints = useMemo(() => Math.max(1, ...(dig?.crews.map((c) => c.points) ?? [1])), [dig]);
  useSolid(index, [[0, 0, 4.9], [BOARD[0], BOARD[1], 1.8], ...CREWS.map((_, i): [number, number, number] => [...crewAt(i), 1])]);
  useSpots(index, [
    { key: "dig-shaft", lx: 0, lz: 0, r: 7.6, label: dig ? `Look down the shaft: chamber ${dig.chamber.number} is ${(dig.chamber.progressBps / 100).toFixed(0)}% dug` : "Look down the shaft", action: () => { audio?.select(); open({ kind: "dig" }); } },
    { key: "dig-board", lx: BOARD[0], lz: BOARD[1] + 1, r: 3.6, label: dig?.me?.openCall ? "Check your call on the board" : "Make your call on the board", action: () => { audio?.select(); open({ kind: "dig", focus: "call" }); } },
    ...CREWS.map((c, i) => {
      const [lx, lz] = crewAt(i);
      return { key: `crew-${c.slug}`, lx, lz, r: 2.8, label: dig?.me?.crew === c.slug ? `Your crew: ${c.name}` : `Join ${c.name}`, action: () => { audio?.select(); open({ kind: "dig", focus: "crew" }); } };
    }),
  ], dig);
  return (
    <group>
      <RoomSign text="The Great Dig" color="#ff8a3d" z={-15.3} y={6.6} />
      <group {...clickable(open, { kind: "dig" })}>
        <Shaft broken={dig ? dig.chamber.number - 1 : 0} progress={(dig?.chamber.progressBps ?? 0) / 10000} />
      </group>
      <group position={[BOARD[0], 0, BOARD[1]]} {...clickable(open, { kind: "dig", focus: "call" })}>
        <mesh position={[0, 1.7, 0]} castShadow><boxGeometry args={[4.4, 3, 0.25]} /><meshStandardMaterial color="#3a2819" roughness={1} /></mesh>
        <Text font={WORLD_FONT} position={[0, 2.65, 0.15]} fontSize={0.44} color="#fdfbc8" anchorX="center">{dig ? `CALL SHIFT ${dig.shift.open.index}` : "CALL THE SHIFT"}<meshBasicMaterial color="#fdfbc8" toneMapped={false} /></Text>
        {["ASLEEP", "STIRRING", "RUNNING", "SPRINTING"].map((b, i) => {
          const on = dig?.me?.openCall === b.toLowerCase();
          return <Text key={b} font={WORLD_FONT} position={[-1.05 + (i % 2) * 2.1, 1.85 - Math.floor(i / 2) * 0.62, 0.15]} fontSize={0.36} color={on ? "#f2c230" : "#b6b6c2"} anchorX="center">{b}<meshBasicMaterial color={on ? "#f2c230" : "#b6b6c2"} toneMapped={false} /></Text>;
        })}
      </group>
      {CREWS.map((c, i) => {
        const [x, z] = crewAt(i);
        const score = dig?.crews.find((k) => k.slug === c.slug)?.points ?? 0;
        const h = 2.2 + (score / maxPoints) * 3;
        return (
          <group key={c.slug} position={[x, 0, z]} rotation={[0, -crewAngle(i), 0]} {...clickable(open, { kind: "dig", focus: "crew" })}>
            <mesh position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[0.09, 0.12, h, 8]} /><meshStandardMaterial color="#6b4f22" metalness={0.3} roughness={0.7} /></mesh>
            <mesh position={[0.62, h - 0.6, 0]}><planeGeometry args={[1.2, 1.1]} /><meshStandardMaterial color={c.color} emissive={c.color} emissiveIntensity={dig?.me?.crew === c.slug ? 1.1 : 0.35} side={THREE.DoubleSide} /></mesh>
            <Text font={WORLD_FONT} position={[0, 0.5, 0.2]} fontSize={0.3} color={c.color} anchorX="center" maxWidth={2}>{c.name.toUpperCase()}<meshBasicMaterial color={c.color} toneMapped={false} /></Text>
          </group>
        );
      })}
    </group>
  );
}
