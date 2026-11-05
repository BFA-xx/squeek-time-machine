"use client";
import { Text } from "@react-three/drei";
import { formatInt } from "@stm/shared";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { audio } from "@/lib/audio";
import { practiceWheel } from "../ride";
import { GiantWheel } from "../Wheel";
import { clickable, RoomSign, useSolid, useSpots, WORLD_FONT } from "./common";

interface Bucket { startMinuteUtc: number; workUnits?: string | null }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CONSOLE: [number, number] = [8.2, -7.2];

/**
 * The real data stands around a wheel you can run on yourself. The ring of 48 columns is
 * measured work per half hour. The wheel in the middle is yours, and says so.
 */
export default function WheelRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const setRide = useWorld((s) => s.setRide);
  const ref = useRef<THREE.InstancedMesh>(null);
  const [tall, setTall] = useState<[number, number, number][]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [day, setDay] = useState<string | null>(null);
  useSolid(index, [[0, 0, 3.4], [CONSOLE[0], CONSOLE[1], 1.2], ...tall]);
  useEffect(() => {
    api<{ days: { date: string; buckets: Bucket[] }[] }>("/wheel").then((r) => {
      setBuckets(r.days[0]?.buckets ?? []);
      setDay(r.days[0]?.date ?? null);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const max = Math.max(1, ...buckets.map((b) => Number(b.workUnits ?? 0)));
    const col = new THREE.Color();
    const solid: [number, number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const raw = buckets[i]?.workUnits;
      const known = raw !== null && raw !== undefined;
      const h = known ? 0.12 + (Number(raw) / max) * 5 : 0.05;
      if (h > 0.5) solid.push([Math.sin(a) * 12.5, Math.cos(a) * 12.5, 0.55]);
      d.position.set(Math.sin(a) * 12.5, h / 2, Math.cos(a) * 12.5);
      d.rotation.y = a;
      d.scale.set(1, h, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, col.set(known ? "#a98a4a" : "#2a2622"));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    setTall(solid);
  }, [buckets]);
  const openRoom = () => { audio?.select(); open({ kind: "room", room: "wheel" }); };
  useSpots(index, [
    { key: "ride", lx: 0, lz: 3.6, r: 4.2, label: "Hop on the practice wheel", action: () => { audio?.portal(); setRide("wheel"); } },
    { key: "wheel-console", lx: CONSOLE[0], lz: CONSOLE[1], r: 3, label: "Read the wheel's real records", action: openRoom },
    ...buckets.flatMap((b, i) => {
      if (b.workUnits === null || b.workUnits === undefined || Number(b.workUnits) === 0) return [];
      const a = (i / 48) * Math.PI * 2;
      return [{ key: `bar-${i}`, lx: Math.sin(a) * 12.5, lz: Math.cos(a) * 12.5, r: 1.8, label: `${day ?? ""} ${hhmm(b.startMinuteUtc)} UTC: ${formatInt(b.workUnits)} work`, action: openRoom }];
    }),
  ], buckets);
  return (
    <group>
      <RoomSign text="The Wheel Room" color="#ffc048" />
      <group rotation={[0, Math.PI / 2, 0]} scale={0.62}>
        <GiantWheel radius={5} width={3} showHamster={false} driver={practiceWheel} onClick={() => { if (!useWorld.getState().ride) setRide("wheel"); }} />
      </group>
      <Text font={WORLD_FONT} position={[0, 7.1, 0]} rotation={[0, 0, 0]} fontSize={0.34} letterSpacing={0.12} color="#efeadf" anchorX="center">
        PRACTICE WHEEL · YOUR LEGS, NOT HIS DATA
        <meshBasicMaterial color="#efeadf" toneMapped={false} />
      </Text>
      <group position={[CONSOLE[0], 0, CONSOLE[1]]} rotation={[0, -0.85, 0]} {...clickable(open, { kind: "room", room: "wheel" })}>
        <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[1.5, 1.5, 0.8]} /><meshStandardMaterial color="#2a241e" metalness={0.55} roughness={0.42} /></mesh>
        <mesh position={[0, 1.62, 0.1]} rotation={[-0.5, 0, 0]}><boxGeometry args={[1.3, 0.05, 0.7]} /><meshStandardMaterial color="#3a3026" metalness={0.4} roughness={0.3} emissive="#ffc048" emissiveIntensity={0.28} /></mesh>
      </group>
      <instancedMesh ref={ref} args={[undefined, undefined, 48]} castShadow {...clickable(open, { kind: "room", room: "wheel" })}>
        <boxGeometry args={[0.8, 1, 0.5]} />
        <meshStandardMaterial roughness={0.4} metalness={0.45} emissive="#f2c230" emissiveIntensity={0.03} />
      </instancedMesh>
    </group>
  );
}
