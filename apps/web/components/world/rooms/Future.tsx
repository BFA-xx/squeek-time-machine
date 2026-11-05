"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useWorld } from "@/lib/store";
import { clickable, RoomSign } from "./common";

interface Lock { key: string; title: string; target: string; current: string | null }

/** Sealed doors. The ring around each one fills with real progress toward a real threshold. */
export default function FutureRoom() {
  const open = useWorld((s) => s.openPanel);
  const bump = useWorld((s) => s.blockBump);
  const [locks, setLocks] = useState<Lock[]>([]);
  useEffect(() => {
    api<{ locks: Lock[] }>("/future").then((r) => setLocks(r.locks)).catch(() => undefined);
  }, [bump]);
  const stars = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 1.4, r = 13 + Math.random() * 2.5;
      p.set([Math.sin(a) * Math.cos(b) * r, 6 + Math.sin(b) * 8, Math.cos(a) * Math.cos(b) * r], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    if (stars.current) stars.current.rotation.y += dt * 0.012;
  });
  return (
    <group>
      <RoomSign text="The Future" color="#fdfbc8" y={6.8} />
      <points ref={stars} geometry={geo}><pointsMaterial color="#fdfbc8" size={0.09} sizeAttenuation transparent opacity={0.8} toneMapped={false} /></points>
      {locks.slice(0, 7).map((l, i, all) => {
        const a = (i - (all.length - 1) / 2) * 0.62;
        const pct = l.current ? Math.min(1, Number((BigInt(l.current) * 10000n) / BigInt(l.target)) / 10000) : 0;
        return (
          <group key={l.key} position={[Math.sin(a) * 13.4, 0, -Math.cos(a) * 13.4]} rotation={[0, -a, 0]} {...clickable(open, { kind: "room", room: "future" })}>
            <mesh position={[0, 2.5, 0]} castShadow><boxGeometry args={[3, 5, 0.4]} /><meshStandardMaterial color="#26222b" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0, 3.1, 0.24]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.95, 0.07, 8, 64]} /><meshStandardMaterial color="#3a3a46" /></mesh>
            <mesh position={[0, 3.1, 0.28]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.95, 0.1, 8, 64, Math.max(pct, 0.005) * Math.PI * 2]} /><meshStandardMaterial color="#f2c230" emissive="#f2c230" emissiveIntensity={1.5} toneMapped={false} /></mesh>
            <mesh position={[0, 3.1, 0.25]}><boxGeometry args={[0.5, 0.6, 0.08]} /><meshStandardMaterial color="#b98a2a" metalness={0.8} roughness={0.3} /></mesh>
          </group>
        );
      })}
    </group>
  );
}
