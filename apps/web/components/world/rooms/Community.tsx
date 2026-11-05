"use client";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { api, type Memory } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { audio } from "@/lib/audio";
import { clickable, RoomSign, useSolid, useSpots } from "./common";

const POLLS: [number, number] = [-7.5, -6];

/** Each real memory hangs as a lantern. An empty room stays empty, because nothing here is faked. */
export default function CommunityRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.memoryBump);
  useSolid(index, [[0, 0, 2.8], [POLLS[0], POLLS[1], 1.3]]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    api<Memory[]>("/community/memories?limit=100").then(setMemories).catch(() => undefined);
  }, [bump]);
  const place = (i: number): [number, number, number] => {
    const a = i * 2.399963;
    const r = 4.5 + ((i * 37) % 90) / 10;
    return [Math.sin(a) * r, 3.2 + ((i * 13) % 40) / 10, Math.cos(a) * r];
  };
  const openMemory = (m: Memory) => {
    audio?.select();
    if (m.subject.startsWith("event:")) open({ kind: "event", id: m.subject.slice(6) });
    else if (m.subject.startsWith("block:")) open({ kind: "block", height: m.subject.slice(6) });
    else open({ kind: "room", room: "community" });
  };
  useSpots(index, [
    { key: "write-memory", lx: 0, lz: 0, r: 5, label: "Write your memory on the monument", action: () => { audio?.select(); open({ kind: "write", mode: "memory" }); } },
    { key: "poll-board", lx: POLLS[0], lz: POLLS[1], r: 3, label: "Vote at the poll board", action: () => { audio?.select(); open({ kind: "room", room: "community" }); } },
    ...memories.map((m, i) => {
      const [lx, , lz] = place(i);
      return { key: `lantern-${m.id}`, lx, lz, r: 1.7, label: `Read ${m.displayName ?? m.username}'s memory`, action: () => openMemory(m) };
    }),
  ], memories);
  const d = useRef(new THREE.Object3D());
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || !memories.length) return;
    memories.forEach((_, i) => {
      const [x, y, z] = place(i);
      d.current.position.set(x, y + Math.sin(clock.elapsedTime * 0.5 + i) * 0.1, z);
      d.current.updateMatrix();
      m.setMatrixAt(i, d.current.matrix);
    });
    m.count = memories.length;
    m.instanceMatrix.needsUpdate = true;
  });
  const hovered = hover !== null ? memories[hover] : null;
  return (
    <group>
      <RoomSign text="I was here" color="#f08fb0" />
      <group position={[POLLS[0], 0, POLLS[1]]} rotation={[0, 0.9, 0]} {...clickable(open, { kind: "room", room: "community" })}>
        <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[2.2, 2.8, 0.1]} /><meshStandardMaterial color="#2a241e" metalness={0.55} roughness={0.42} /></mesh>
        {[0, 1, 2].map((k) => <mesh key={k} position={[-0.25, 1.05 + k * 0.55, 0.12]}><boxGeometry args={[k === 1 ? 1.5 : 1, 0.28, 0.03]} /><meshStandardMaterial color="#f08fb0" emissive="#f08fb0" emissiveIntensity={0.7} toneMapped={false} /></mesh>)}
      </group>
      <group {...clickable(open, { kind: "write", mode: "memory" })}>
        <mesh position={[0, 1.7, 0]} castShadow rotation={[0, 0.4, 0]}><cylinderGeometry args={[0.8, 1.15, 3.4, 48]} /><meshStandardMaterial color="#2a241e" metalness={0.55} roughness={0.42} /></mesh>
        <mesh position={[0, 3.6, 0]}><sphereGeometry args={[0.45, 16, 16]} /><meshStandardMaterial color="#e8a3bb" metalness={0.2} roughness={0.25} emissive="#f08fb0" emissiveIntensity={0.35} /></mesh>
      </group>
      <instancedMesh ref={ref} args={[undefined, undefined, 100]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); if (e.delta < 6 && e.instanceId !== undefined && memories[e.instanceId]) openMemory(memories[e.instanceId]); }}
        onPointerMove={(e) => { e.stopPropagation(); setHover(e.instanceId ?? null); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}>
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshStandardMaterial color="#c9a24a" emissive="#ffc048" emissiveIntensity={0.5} metalness={0.4} roughness={0.3} />
      </instancedMesh>
      {hovered && hover !== null && (
        <Html position={place(hover)} center style={{ pointerEvents: "none", width: 230 }}>
          <div className="card px-2 py-1 text-xs"><p className="text-ink pre-wrap">{hovered.body.slice(0, 140)}</p><p className="font-data text-amber mt-1">{hovered.displayName ?? hovered.username}</p></div>
        </Html>
      )}
    </group>
  );
}
