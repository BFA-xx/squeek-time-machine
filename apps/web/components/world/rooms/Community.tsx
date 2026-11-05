"use client";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { api, type Memory } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { clickable, RoomSign, useSolid } from "./common";

/** Each real memory hangs as a lantern. An empty room stays empty, because nothing here is faked. */
export default function CommunityRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.memoryBump);
  useSolid(index, [[0, 0, 2.8]]);
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
      <group {...clickable(open, { kind: "room", room: "community" })}>
        <mesh position={[0, 1.7, 0]} castShadow rotation={[0, 0.4, 0]}><cylinderGeometry args={[1.1, 2, 3.4, 7]} /><meshStandardMaterial color="#3a2a22" roughness={1} flatShading /></mesh>
        <mesh position={[0, 3.6, 0]}><sphereGeometry args={[0.45, 16, 16]} /><meshStandardMaterial color="#f08fb0" emissive="#f08fb0" emissiveIntensity={1.4} toneMapped={false} /></mesh>
      </group>
      <instancedMesh ref={ref} args={[undefined, undefined, 100]} frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); if (e.delta < 6 && e.instanceId !== undefined && memories[e.instanceId]) open({ kind: "room", room: "community" }); }}
        onPointerMove={(e) => { e.stopPropagation(); setHover(e.instanceId ?? null); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}>
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshStandardMaterial color="#ffc048" emissive="#ffc048" emissiveIntensity={1.5} toneMapped={false} />
      </instancedMesh>
      {hovered && hover !== null && (
        <Html position={place(hover)} center style={{ pointerEvents: "none", width: 230 }}>
          <div className="card px-2 py-1 text-xs"><p className="text-ink pre-wrap">{hovered.body.slice(0, 140)}</p><p className="font-data text-amber mt-1">{hovered.username}</p></div>
        </Html>
      )}
    </group>
  );
}
