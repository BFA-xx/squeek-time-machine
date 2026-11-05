"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { clickable, RoomSign, useSolid } from "./common";

interface Row { workPerThousandBlocks: number; blockHeight: string }

/** Two real curves as sculpture: a wall of difficulty and a rising spiral of block height. */
export default function EvolutionRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.blockBump);
  useSolid(index, [[0, 0, 3]]);
  const [rows, setRows] = useState<Row[]>([]);
  const wall = useRef<THREE.InstancedMesh>(null);
  const spiral = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    api<{ mining: Row[] }>("/evolution").then((r) => setRows(r.mining)).catch(() => undefined);
  }, [bump]);
  const sample = useMemo(() => {
    const cap = 120;
    if (rows.length <= cap) return rows;
    const every = rows.length / cap;
    return Array.from({ length: cap }, (_, i) => rows[Math.floor(i * every)]);
  }, [rows]);
  useEffect(() => {
    const d = new THREE.Object3D();
    const w = wall.current;
    const s = spiral.current;
    if (!w || !s || !sample.length) return;
    const dMin = Math.min(...sample.map((r) => r.workPerThousandBlocks));
    const dMax = Math.max(...sample.map((r) => r.workPerThousandBlocks));
    const hMax = Math.max(1, ...sample.map((r) => Number(r.blockHeight)));
    sample.forEach((r, i) => {
      const t = sample.length === 1 ? 0.5 : i / (sample.length - 1);
      const a = -2.3 + t * 4.6;
      const h = 0.6 + ((r.workPerThousandBlocks - dMin) / Math.max(dMax - dMin, 1)) * 6;
      d.position.set(Math.sin(a) * 13.5, h / 2, -Math.cos(a) * 13.5);
      d.rotation.y = -a;
      d.scale.set(1, h, 1);
      d.updateMatrix();
      w.setMatrixAt(i, d.matrix);
      const b = 2.4 + t * Math.PI * 4;
      const y = 0.8 + (Number(r.blockHeight) / hMax) * 7;
      d.position.set(Math.cos(b) * 3.8, y, Math.sin(b) * 3.8);
      d.rotation.y = 0;
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      s.setMatrixAt(i, d.matrix);
    });
    w.count = s.count = sample.length;
    w.instanceMatrix.needsUpdate = s.instanceMatrix.needsUpdate = true;
    w.computeBoundingSphere();
    s.computeBoundingSphere();
  }, [sample]);
  return (
    <group>
      <RoomSign text="The Evolution Room" color="#a8baff" y={7.4} />
      <mesh position={[0, 4.2, 0]} {...clickable(open, { kind: "room", room: "evolution" })}><cylinderGeometry args={[0.32, 0.5, 8.4, 10]} /><meshStandardMaterial color="#2e3350" metalness={0.5} roughness={0.5} /></mesh>
      <instancedMesh ref={wall} args={[undefined, undefined, 120]} castShadow {...clickable(open, { kind: "room", room: "evolution" })}>
        <boxGeometry args={[0.42, 1, 0.3]} />
        <meshStandardMaterial color="#a8baff" emissive="#a8baff" emissiveIntensity={0.3} metalness={0.3} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={spiral} args={[undefined, undefined, 120]} {...clickable(open, { kind: "room", room: "evolution" })}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#f2c230" emissive="#f2c230" emissiveIntensity={1.1} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
