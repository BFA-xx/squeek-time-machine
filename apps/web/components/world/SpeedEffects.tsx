"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { ride, rideIntensity } from "./ride";

const LINES = 110;
const SPARKS = 70;

/** Everything that makes a fast ride feel fast. All of it scales with the visitor's own speed, and it's skipped with reduced motion. */
export function SpeedEffects({ at }: { at: { x: number; y: number; z: number; backX: number; backZ: number } }) {
  const { camera } = useThree();
  const lines = useRef<THREE.InstancedMesh>(null);
  const lineMat = useRef<THREE.MeshBasicMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const reduced = useWorld((s) => s.settings.reducedMotion);
  const d = useMemo(() => new THREE.Object3D(), []);
  const lineState = useMemo(() => Array.from({ length: LINES }, () => ({ a: Math.random() * Math.PI * 2, z: Math.random(), r: 1.4 + Math.random() * 2.6 })), []);
  const sparkState = useMemo(() => Array.from({ length: SPARKS }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), []);
  const nextSpark = useRef(0);

  useEffect(() => () => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 52;
    cam.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const i = rideIntensity();
    const cam = camera as THREE.PerspectiveCamera;
    const fov = reduced ? 52 : 52 + 42 * i ** 1.4;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 7);
      cam.updateProjectionMatrix();
    }
    if (reduced) return;
    if (i > 0.25) {
      const shake = (i - 0.25) ** 2 * 0.34;
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
    }
    if (group.current) {
      group.current.position.copy(cam.position);
      group.current.quaternion.copy(cam.quaternion);
    }
    if (lines.current && lineMat.current) {
      lineMat.current.opacity = Math.max(0, i - 0.12) ** 1.25 * 1.05;
      lines.current.visible = i > 0.12;
      if (lines.current.visible) {
        lineState.forEach((l, k) => {
          l.z += dt * (0.6 + i * 3.4);
          if (l.z > 1) {
            l.z = 0;
            l.a = Math.random() * Math.PI * 2;
          }
          // Each streak rushes from the middle of the view out past the camera.
          const dist = 8 - l.z * 7.4;
          const radius = l.r * (0.6 + l.z * 1.1);
          d.position.set(Math.cos(l.a) * radius, Math.sin(l.a) * radius, -dist);
          d.rotation.set(0, 0, 0);
          d.lookAt(0, 0, -30);
          d.scale.set(1, 1, 0.8 + i * 5);
          d.updateMatrix();
          lines.current!.setMatrixAt(k, d.matrix);
        });
        lines.current.instanceMatrix.needsUpdate = true;
      }
    }
    if (sparks.current) {
      const rate = i > 0.2 ? (i - 0.2) * 150 : 0;
      nextSpark.current += rate * dt;
      while (nextSpark.current >= 1) {
        nextSpark.current -= 1;
        const s = sparkState.find((p) => p.life <= 0);
        if (!s) break;
        const spread = 1 + i * 2;
        s.life = 0.35 + Math.random() * 0.5;
        s.x = at.x + (Math.random() - 0.5) * 1.6;
        s.y = at.y + Math.random() * 0.2;
        s.z = at.z + (Math.random() - 0.5) * 1.6;
        s.vx = at.backX * (3 + i * 12) + (Math.random() - 0.5) * spread;
        s.vy = 1 + Math.random() * (3 + i * 5);
        s.vz = at.backZ * (3 + i * 12) + (Math.random() - 0.5) * spread;
      }
      sparkState.forEach((s, k) => {
        if (s.life > 0) {
          s.life -= dt;
          s.vy -= 9 * dt;
          s.x += s.vx * dt;
          s.y = Math.max(0.05, s.y + s.vy * dt);
          s.z += s.vz * dt;
        }
        d.position.set(s.x, s.y, s.z);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(s.life > 0 ? 1 : 0.0001);
        d.updateMatrix();
        sparks.current!.setMatrixAt(k, d.matrix);
      });
      sparks.current.instanceMatrix.needsUpdate = true;
    }
  });
  if (reduced) return null;
  return (
    <>
      <group ref={group}>
        <instancedMesh ref={lines} args={[undefined, undefined, LINES]} frustumCulled={false} renderOrder={20}>
          <boxGeometry args={[0.012, 0.012, 1.3]} />
          <meshBasicMaterial ref={lineMat} color="#ffd9a0" transparent opacity={0} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </instancedMesh>
      </group>
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
        <sphereGeometry args={[0.05, 5, 5]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} />
      </instancedMesh>
    </>
  );
}

export { ride };
