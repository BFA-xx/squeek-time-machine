"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { Hamster } from "./Hamster";

const STEEL = "#3a3640";
const BRASS = "#b98a2a";

/**
 * WHEELY9000. It only turns when the wheel really is turning: rotation comes straight from the
 * latest measured RPM. Stale data or a still wheel means no motion. It's never simulated.
 */
export function GiantWheel({ radius = 6, width = 3.4, showHamster = true, onClick }: { radius?: number; width?: number; showHamster?: boolean; onClick?: () => void }) {
  const spin = useRef<THREE.Group>(null);
  const rungs = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const velocity = useRef(0);
  const rpm = useWorld((s) => {
    const fresh = s.live?.freshness === "online" || s.live?.freshness === undefined;
    return fresh ? (s.live?.rpmMilli ?? 0) / 1000 : 0;
  });
  const running = rpm > 0;
  const rungCount = 44;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    if (rungs.current) {
      for (let i = 0; i < rungCount; i++) {
        const a = (i / rungCount) * Math.PI * 2;
        dummy.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        rungs.current.setMatrixAt(i, dummy.matrix);
      }
      rungs.current.instanceMatrix.needsUpdate = true;
    }
    if (lights.current) {
      for (let i = 0; i < 88; i++) {
        const a = (i / 88) * Math.PI * 2;
        dummy.position.set(Math.cos(a) * (radius + 0.5), Math.sin(a) * (radius + 0.5), width / 2 + 0.12);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lights.current.setMatrixAt(i, dummy.matrix);
      }
      lights.current.instanceMatrix.needsUpdate = true;
    }
  }, [dummy, radius, width]);
  useFrame((_, dt) => {
    // Eases toward the measured speed. It's a slow visual ratio of real RPM, and exactly zero when he's still.
    const target = (rpm / 60) * Math.PI * 2 * 0.35;
    velocity.current += (target - velocity.current) * Math.min(1, dt * 1.2);
    if (spin.current) spin.current.rotation.z -= velocity.current * dt;
    if (glow.current) glow.current.emissiveIntensity += ((running ? 2.4 : 0.7) - glow.current.emissiveIntensity) * Math.min(1, dt * 2);
  });
  const legH = radius + 0.1;
  return (
    <group onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined} onPointerOut={onClick ? () => { document.body.style.cursor = ""; } : undefined}>
      <mesh position={[0, 0.2, 0]} receiveShadow castShadow><cylinderGeometry args={[radius * 0.82, radius * 0.95, 0.4, 40]} /><meshStandardMaterial color="#231a14" roughness={0.9} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * (width / 2 + 0.55)]}>
          <mesh castShadow position={[-radius * 0.42, legH / 2 + 0.3, 0]} rotation={[0, 0, -0.42]}><boxGeometry args={[0.34, legH * 1.1, 0.34]} /><meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.45} /></mesh>
          <mesh castShadow position={[radius * 0.42, legH / 2 + 0.3, 0]} rotation={[0, 0, 0.42]}><boxGeometry args={[0.34, legH * 1.1, 0.34]} /><meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.45} /></mesh>
          <mesh position={[0, radius + 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.55, 0.55, 0.4, 18]} /><meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.35} /></mesh>
        </group>
      ))}
      <mesh position={[0, radius + 1.1, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, width + 1.2, 12]} /><meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.3} /></mesh>
      <group position={[0, radius + 1.1, 0]}>
        <group ref={spin}>
          {[-1, 1].map((s) => (
            <group key={s} position={[0, 0, (s * width) / 2]}>
              <mesh castShadow><torusGeometry args={[radius, 0.17, 10, 72]} /><meshStandardMaterial color={BRASS} metalness={0.75} roughness={0.38} /></mesh>
              {Array.from({ length: 8 }, (_, i) => (
                <mesh key={i} rotation={[0, 0, (i / 8) * Math.PI * 2]} position={[0, 0, 0]}><boxGeometry args={[radius * 2, 0.09, 0.09]} /><meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.5} /></mesh>
              ))}
            </group>
          ))}
          <instancedMesh ref={rungs} args={[undefined, undefined, rungCount]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, width, 6]} />
            <meshStandardMaterial color="#cfc6b4" metalness={0.5} roughness={0.5} />
          </instancedMesh>
          <mesh position={[radius - 0.02, 0, width / 2 + 0.2]}><boxGeometry args={[0.34, 0.5, 0.12]} /><meshStandardMaterial color="#d9d9e3" metalness={0.8} roughness={0.25} emissive="#5b7cfa" emissiveIntensity={0.7} /></mesh>
        </group>
        <instancedMesh ref={lights} args={[undefined, undefined, 88]}>
          <sphereGeometry args={[0.055, 6, 6]} />
          <meshStandardMaterial ref={glow} color="#f2c230" emissive="#f2c230" emissiveIntensity={0.7} toneMapped={false} />
        </instancedMesh>
      </group>
      <group position={[-0.1, 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
        {/* He only appears on the wheel when the wheel is measurably turning. An empty wheel means no running right now. */}
        {showHamster && running && <group position={[0, 0.55, 0]}><Hamster scale={1.25} wheelRun /></group>}
      </group>
    </group>
  );
}
