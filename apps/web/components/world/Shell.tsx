"use client";
import { ROOMS } from "@stm/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { HUB_R, ROOM_ANGLES, ROOM_R, TUNNEL_HALF, roomCenter, roomDistance } from "./layout";
import { dotFloorTexture, earthBump, noise2 } from "./textures";

const WALL_H = 7;

/** A rough earth wall: a lathe segment whose vertices are pushed around so it reads as dug out, not machined. */
function caveGeometry(radius: number, height: number, phiStart: number, phiLength: number, seed: number, doming: boolean) {
  const pts: THREE.Vector2[] = [];
  const rows = doming ? 12 : 8;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    if (doming) pts.push(new THREE.Vector2(radius * Math.cos((t * Math.PI) / 2) + 0.001, WALL_H + height * Math.sin((t * Math.PI) / 2)));
    else pts.push(new THREE.Vector2(radius, t * WALL_H));
  }
  const g = new THREE.LatheGeometry(pts, Math.max(8, Math.round((phiLength / (Math.PI * 2)) * 72)), phiStart, phiLength);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(x, z);
    const n = noise2(a * 3 + seed, y * 0.35 + seed) * 0.9;
    const grow = 1 + (n / Math.max(radius, 1)) * 1.4;
    p.setXYZ(i, x * grow, y + (doming ? n * 0.5 : 0), z * grow);
  }
  g.computeVertexNormals();
  return g;
}

export function Shells() {
  const bump = useMemo(() => earthBump(), []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#35241a", roughness: 1, side: THREE.BackSide, bumpMap: bump, bumpScale: 0.6 }), [bump]);
  const floorHub = useMemo(() => dotFloorTexture(28), []);
  const floorRoom = useMemo(() => dotFloorTexture(16), []);
  const floorTun = useMemo(() => { const t = dotFloorTexture(1); t.repeat.set(4, 12); return t; }, []);
  const gap = Math.asin(TUNNEL_HALF / HUB_R) * 1.05;
  const roomGap = Math.asin(TUNNEL_HALF / ROOM_R) * 1.05;

  const hubParts = useMemo(() => ROOMS.map((_, i) => {
    const a = ROOM_ANGLES[i] + gap;
    const b = ROOM_ANGLES[(i + 1) % ROOMS.length] - gap + (i === ROOMS.length - 1 ? Math.PI * 2 : 0);
    return caveGeometry(HUB_R + 0.6, 0, a, b - a, i * 4.1, false);
  }), [gap]);
  const hubDome = useMemo(() => caveGeometry(HUB_R + 0.6, 12, 0, Math.PI * 2, 2.2, true), []);
  const roomWall = useMemo(() => caveGeometry(ROOM_R + 0.5, 0, roomGap, Math.PI * 2 - roomGap * 2, 7.7, false), [roomGap]);
  const roomDome = useMemo(() => caveGeometry(ROOM_R + 0.5, 8, 0, Math.PI * 2, 3.3, true), []);

  useEffect(() => () => {
    hubParts.forEach((g) => g.dispose());
    [hubDome, roomWall, roomDome].forEach((g) => g.dispose());
    [bump, floorHub, floorRoom, floorTun].forEach((t) => t.dispose());
    wall.dispose();
  }, [hubParts, hubDome, roomWall, roomDome, bump, floorHub, floorRoom, floorTun, wall]);

  const tunnelLen = roomDistance - ROOM_R - HUB_R + 4;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="floor"><circleGeometry args={[HUB_R + 0.8, 64]} /><meshStandardMaterial map={floorHub} roughness={0.92} /></mesh>
      {hubParts.map((g, i) => <mesh key={i} geometry={g} material={wall} />)}
      <mesh geometry={hubDome} material={wall} />

      {ROOMS.map((r, i) => {
        const c = roomCenter(i);
        const a = ROOM_ANGLES[i];
        const mid = HUB_R - 2 + tunnelLen / 2;
        return (
          <group key={r.slug}>
            <group position={[Math.sin(a) * mid, 0, Math.cos(a) * mid]} rotation={[0, a, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow name="floor"><planeGeometry args={[TUNNEL_HALF * 2 + 0.4, tunnelLen]} /><meshStandardMaterial map={floorTun} roughness={0.92} /></mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={wall}><cylinderGeometry args={[TUNNEL_HALF + 0.2, TUNNEL_HALF + 0.2, tunnelLen, 18, 1, true, Math.PI / 2, Math.PI]} /></mesh>
              {Array.from({ length: 4 }, (_, k) => (
                <mesh key={k} position={[0, 0, (k - 1.5) * (tunnelLen / 4)]}><torusGeometry args={[TUNNEL_HALF + 0.05, 0.1, 6, 18, Math.PI]} /><meshStandardMaterial color="#6b4f22" emissive={r.color} emissiveIntensity={0.25} roughness={0.7} /></mesh>
              ))}
            </group>
            <group position={[c.x, 0, c.z]} rotation={[0, a + Math.PI, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow name="floor"><circleGeometry args={[ROOM_R + 0.7, 48]} /><meshStandardMaterial map={floorRoom} roughness={0.92} /></mesh>
              <mesh geometry={roomWall} material={wall} />
              <mesh geometry={roomDome} material={wall} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Rows of small gold lights along the cave walls: the brand's dot grid, carved into the earth. */
export function WallDots() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 420;
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D();
    let n = 0;
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 84 && n < count; k++) {
        const a = (k / 84) * Math.PI * 2;
        const nearDoor = ROOM_ANGLES.some((da) => Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da))) < 0.17);
        d.position.set(Math.sin(a) * (HUB_R + 0.1), 3.2 + row * 0.75, Math.cos(a) * (HUB_R + 0.1));
        d.scale.setScalar(nearDoor && row < 4 ? 0.0001 : 1);
        d.updateMatrix();
        m.setMatrixAt(n++, d.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.07, 6, 6]} />
      <meshStandardMaterial color="#f2c230" emissive="#f2c230" emissiveIntensity={1.6} toneMapped={false} />
    </instancedMesh>
  );
}

/** A glowing arch at each tunnel mouth. Walk through it, or click it to go there. */
export function Portals() {
  const requestTravel = useWorld((s) => s.requestTravel);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    mats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 1.3 + Math.sin(clock.elapsedTime * 1.2 + i) * 0.25;
    });
  });
  return (
    <>
      {ROOMS.map((r, i) => {
        const a = ROOM_ANGLES[i];
        return (
          <group key={r.slug} position={[Math.sin(a) * (HUB_R - 0.6), 0, Math.cos(a) * (HUB_R - 0.6)]} rotation={[0, a, 0]}
            onClick={(e) => { e.stopPropagation(); if (e.delta < 6) requestTravel(r.slug); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}>
            <mesh castShadow><torusGeometry args={[TUNNEL_HALF + 0.35, 0.26, 10, 28, Math.PI]} /><meshStandardMaterial ref={(m) => { mats.current[i] = m; }} color={r.color} emissive={r.color} emissiveIntensity={1.3} toneMapped={false} /></mesh>
            {[-1, 1].map((s) => <mesh key={s} position={[s * (TUNNEL_HALF + 0.35), -0.1, 0]} castShadow><boxGeometry args={[0.5, 0.5, 0.7]} /><meshStandardMaterial color="#231a14" /></mesh>)}
            <mesh position={[0, TUNNEL_HALF / 2, -0.02]}><planeGeometry args={[TUNNEL_HALF * 2, TUNNEL_HALF * 2.1]} /><meshBasicMaterial color={r.color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} /></mesh>
          </group>
        );
      })}
    </>
  );
}
