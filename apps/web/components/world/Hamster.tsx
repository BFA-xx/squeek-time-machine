"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

const FUR = "#d59a5e";
const WHITE = "#f3e7d6";
const EAR = "#c07e72";
const DARK = "#1b1210";

/** A small white-orange Syrian hamster, built from primitives. `speed` is how fast it's walking right now. */
export function Hamster({ speedRef, scale = 1, asleep = false, wheelRun = false }: { speedRef?: React.RefObject<number>; scale?: number; asleep?: boolean; wheelRun?: boolean }) {
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const body = useRef<THREE.Group>(null);
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    const speed = wheelRun ? 6 : speedRef?.current ?? 0;
    t.current += dt * (2 + speed * 2.6);
    const swing = Math.min(speed, 6) * 0.11;
    legs.current.forEach((l, i) => {
      if (l) l.position.z = l.userData.z + Math.sin(t.current + (i % 3 === 0 ? 0 : Math.PI)) * swing;
    });
    if (body.current) {
      const breathe = asleep ? Math.sin(t.current * 0.35) * 0.018 : Math.sin(t.current * 0.6) * 0.008;
      body.current.scale.y = 1 + breathe;
      body.current.position.y = speed > 0.1 ? Math.abs(Math.sin(t.current)) * 0.05 : 0;
    }
  });
  return (
    <group scale={scale}>
      <group ref={body} rotation={asleep ? [0.12, 0, 0] : [0, 0, 0]}>
        <mesh castShadow position={[0, 0.42, 0]} scale={[0.5, 0.42, 0.62]}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={FUR} roughness={0.95} /></mesh>
        <mesh position={[0, 0.3, 0.1]} scale={[0.42, 0.3, 0.52]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={WHITE} roughness={1} /></mesh>
        <group position={[0, asleep ? 0.45 : 0.62, 0.52]}>
          <mesh castShadow scale={[0.38, 0.34, 0.36]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={FUR} roughness={0.95} /></mesh>
          <mesh position={[0, -0.09, 0.12]} scale={[0.25, 0.19, 0.26]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={WHITE} roughness={1} /></mesh>
          <mesh position={[-0.24, -0.06, 0.08]} scale={0.16}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={WHITE} roughness={1} /></mesh>
          <mesh position={[0.24, -0.06, 0.08]} scale={0.16}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={WHITE} roughness={1} /></mesh>
          <mesh position={[-0.24, 0.27, -0.06]} scale={[0.12, 0.13, 0.05]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={EAR} roughness={0.8} /></mesh>
          <mesh position={[0.24, 0.27, -0.06]} scale={[0.12, 0.13, 0.05]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={EAR} roughness={0.8} /></mesh>
          {asleep ? (
            <>
              <mesh position={[-0.15, 0.06, 0.31]} scale={[0.05, 0.008, 0.01]}><boxGeometry args={[1.6, 1.6, 1]} /><meshStandardMaterial color={DARK} /></mesh>
              <mesh position={[0.15, 0.06, 0.31]} scale={[0.05, 0.008, 0.01]}><boxGeometry args={[1.6, 1.6, 1]} /><meshStandardMaterial color={DARK} /></mesh>
            </>
          ) : (
            <>
              <mesh position={[-0.15, 0.07, 0.29]} scale={0.052}><sphereGeometry args={[1, 8, 8]} /><meshStandardMaterial color={DARK} roughness={0.2} /></mesh>
              <mesh position={[0.15, 0.07, 0.29]} scale={0.052}><sphereGeometry args={[1, 8, 8]} /><meshStandardMaterial color={DARK} roughness={0.2} /></mesh>
            </>
          )}
          <mesh position={[0, -0.03, 0.36]} scale={0.032}><sphereGeometry args={[1, 8, 8]} /><meshStandardMaterial color="#d98a8a" /></mesh>
        </group>
        <mesh position={[0, 0.42, -0.6]} scale={0.07}><sphereGeometry args={[1, 8, 8]} /><meshStandardMaterial color={WHITE} /></mesh>
      </group>
      {[[-0.28, 0.32], [0.28, 0.32], [-0.28, -0.32], [0.28, -0.32]].map(([x, z], i) => (
        <mesh key={i} ref={(m) => { legs.current[i] = m; if (m) m.userData.z = z; }} position={[x, 0.07, z]} scale={[0.09, 0.07, 0.13]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={EAR} roughness={0.9} /></mesh>
      ))}
    </group>
  );
}
