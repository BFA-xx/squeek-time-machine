"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { GiantWheel } from "../Wheel";
import { clickable, RoomSign, useSolid } from "./common";

interface Bucket { startMinuteUtc: number; workUnits?: string | null }

/** A ring of 48 columns around the wheel: real work per half hour on the latest day with readings. */
export default function WheelRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  useSolid(index, [[0, 0, 4.2]]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const [tall, setTall] = useState<[number, number, number][]>([]);
  useSolid(index, tall);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  useEffect(() => {
    api<{ days: { buckets: Bucket[] }[] }>("/wheel").then((r) => setBuckets(r.days[0]?.buckets ?? [])).catch(() => undefined);
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
      m.setColorAt(i, col.set(known ? "#f2c230" : "#3a3a46"));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    setTall(solid);
  }, [buckets]);
  return (
    <group>
      <RoomSign text="The Wheel Room" color="#ffc048" />
      <group rotation={[0, Math.PI / 2, 0]} scale={0.62}><GiantWheel radius={5} width={3} showHamster={false} onClick={() => open({ kind: "room", room: "wheel" })} /></group>
      <instancedMesh ref={ref} args={[undefined, undefined, 48]} castShadow {...clickable(open, { kind: "room", room: "wheel" })}>
        <boxGeometry args={[0.8, 1, 0.5]} />
        <meshStandardMaterial roughness={0.5} metalness={0.3} emissive="#f2c230" emissiveIntensity={0.15} />
      </instancedMesh>
    </group>
  );
}
