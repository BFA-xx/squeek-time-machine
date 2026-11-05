"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api, type BlockSummary } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { audio } from "@/lib/audio";
import { clickable, RoomSign, useSolid } from "./common";

const MAX = 6000;
const PER_RING = 118;
const DOOR_GAP = 0.34;
const pos = new THREE.Object3D();

/** One cube per real block, wound around the vault wall from the floor up. A new settlement adds cubes. */
function blockPlace(i: number): [number, number, number] {
  const ring = Math.floor(i / PER_RING);
  // Winds around the wall and leaves the doorway clear.
  const a = DOOR_GAP + ((i % PER_RING) / PER_RING) * (Math.PI * 2 - DOOR_GAP * 2);
  const r = 15.5 - (ring % 2) * 0.08;
  return [Math.sin(a) * r, 0.34 + ring * 0.46, Math.cos(a) * r];
}

export default function VaultRoom({ index }: { index: number }) {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.blockBump);
  const highlight = useWorld((s) => s.highlightBlock);
  useSolid(index, [[0, 0, 2.4]]);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const beacon = useRef<THREE.Mesh>(null);
  useEffect(() => {
    let live = true;
    api<{ blocks: BlockSummary[] }>(`/blocks?limit=2000`).then((r) => live && setBlocks(r.blocks.slice().reverse())).catch(() => undefined);
    return () => { live = false; };
  }, [bump]);
  const col = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const n = Math.min(blocks.length, MAX);
    blocks.slice(0, n).forEach((b, i) => {
      const [x, y, z] = blockPlace(i);
      pos.position.set(x, y, z);
      pos.rotation.y = Math.atan2(x, z);
      pos.updateMatrix();
      m.setMatrixAt(i, pos.matrix);
      const newest = i >= n - 18;
      m.setColorAt(i, col.set(b.height === highlight ? "#fdfbc8" : newest ? "#7dffb6" : "#35d07f"));
    });
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    const hi = blocks.findIndex((b) => b.height === highlight);
    if (beacon.current) {
      beacon.current.visible = hi >= 0;
      if (hi >= 0) {
        const [x, y, z] = blockPlace(hi);
        beacon.current.position.set(x * 0.97, y + 0.55, z * 0.97);
      }
    }
  }, [blocks, highlight, col]);
  return (
    <group>
      <RoomSign text="The Block Vault" color="#35d07f" y={6.2} />
      <mesh position={[0, 1, 0]} castShadow {...clickable(open, { kind: "room", room: "vault" })}><cylinderGeometry args={[1.2, 2, 2, 8]} /><meshStandardMaterial color="#1f2a24" metalness={0.5} roughness={0.5} /></mesh>
      <mesh position={[0, 2.5, 0]}  {...clickable(open, { kind: "room", room: "vault" })}><octahedronGeometry args={[0.8]} /><meshStandardMaterial color="#35d07f" emissive="#35d07f" emissiveIntensity={1.2} toneMapped={false} /></mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, MAX]} castShadow
        onClick={(e) => { e.stopPropagation(); if (e.delta < 6 && e.instanceId !== undefined && blocks[e.instanceId]) { audio?.select(); open({ kind: "block", height: blocks[e.instanceId].height }); } }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <boxGeometry args={[0.72, 0.38, 0.5]} />
        <meshStandardMaterial roughness={0.35} metalness={0.45} emissive="#35d07f" emissiveIntensity={0.25} />
      </instancedMesh>
      <mesh ref={beacon} visible={false}><coneGeometry args={[0.3, 0.6, 8]} /><meshBasicMaterial color="#fdfbc8" toneMapped={false} /></mesh>
    </group>
  );
}
