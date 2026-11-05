"use client";
import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { ROOMS } from "@stm/shared";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { WORLD_FONT } from "./rooms/common";
import { HUB_R, ROOM_ANGLES, ROOM_R, TUNNEL_HALF, roomCenter, roomDistance } from "./layout";
import { WALL_H, arcWall, barrelVault, dome, domeMaterial, doorSurround, wallClock, wallMaterial } from "./architecture";
import { rideIntensity } from "./ride";
import { stoneFloor, tunnelFloor } from "./textures";

export const HUB_WALL = HUB_R + 0.6;
export const ROOM_WALL = ROOM_R + 0.5;
const HUB_ACCENT = "#c9a24a";
const ARCH_R = TUNNEL_HALF + 0.2;
const LINTEL = ARCH_R + 0.25;

const panelFor = (radius: number, width: number) => (Math.PI * 2 * radius) / Math.round((Math.PI * 2 * radius) / width);

/** Wall bays between doors, plus the lintel over each door, so the wall is unbroken above head height. */
function wallsWithDoors(radius: number, doors: number[]) {
  const gap = Math.asin((ARCH_R + 0.12) / radius);
  const sorted = [...doors].sort((a, b) => a - b);
  const parts: THREE.BufferGeometry[] = [];
  sorted.forEach((a, i) => {
    const next = i === sorted.length - 1 ? sorted[0] + Math.PI * 2 : sorted[i + 1];
    parts.push(arcWall(radius, a + gap, next - gap, 0, WALL_H), arcWall(radius, a - gap, a + gap, LINTEL, WALL_H));
  });
  return parts;
}

export function Shells() {
  const reduced = useWorld((s) => s.settings.reducedMotion);
  const live = useWorld((s) => s.live);
  const running = (live?.rpmMilli ?? 0) > 0 ? 0.25 : 0;
  const hubMat = useMemo(() => wallMaterial({ accent: HUB_ACCENT, panel: panelFor(HUB_WALL, 4.2), rail: 6.72, round: Math.PI * 2 * HUB_WALL }), []);
  const hubDomeMat = useMemo(() => domeMaterial(HUB_ACCENT, 32), []);
  const roomMats = useMemo(() => ROOMS.map((r) => wallMaterial({ accent: r.color, panel: panelFor(ROOM_WALL, 3.4), rail: 5.2, round: Math.PI * 2 * ROOM_WALL })), []);
  const roomDomes = useMemo(() => ROOMS.map((r) => domeMaterial(r.color, 24)), []);
  const tunnelMats = useMemo(() => ROOMS.map((r) => wallMaterial({ accent: r.color, panel: 2, reveal: 2.2 })), []);
  const floorHub = useMemo(() => stoneFloor(HUB_R + 0.8, 2048, [7.5, 14, 20.5]), []);
  const floorRoom = useMemo(() => stoneFloor(ROOM_R + 0.7, 1024, [5, 10.5]), []);
  const hubParts = useMemo(() => wallsWithDoors(HUB_WALL, [...ROOM_ANGLES]), []);
  const hubDome = useMemo(() => dome(HUB_WALL, 12), []);
  const roomParts = useMemo(() => wallsWithDoors(ROOM_WALL, [0]), []);
  const roomDome = useMemo(() => dome(ROOM_WALL, 8), []);
  const vaultLen = roomDistance - ROOM_WALL - HUB_WALL + 0.2;
  const vault = useMemo(() => barrelVault(ARCH_R, vaultLen), [vaultLen]);
  const floorLen = roomDistance - ROOM_R - HUB_R + 4;
  const floorTun = useMemo(() => tunnelFloor(floorLen), [floorLen]);

  useEffect(() => () => {
    [...hubParts, ...roomParts, hubDome, roomDome, vault].forEach((g) => g.dispose());
    [floorHub, floorRoom, floorTun].forEach((t) => t.dispose());
    [hubMat, hubDomeMat, ...roomMats, ...roomDomes, ...tunnelMats].forEach((m) => m.dispose());
  }, [hubParts, roomParts, hubDome, roomDome, vault, floorHub, floorRoom, floorTun, hubMat, hubDomeMat, roomMats, roomDomes, tunnelMats]);

  useFrame(({ clock }) => {
    if (reduced) return;
    wallClock.uTime.value = clock.elapsedTime;
    wallClock.uPulse.value = Math.max(running, rideIntensity());
  });

  const vaultMid = HUB_WALL - 0.1 + vaultLen / 2;
  const floorMid = HUB_R - 2 + floorLen / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="floor"><circleGeometry args={[HUB_R + 0.8, 96]} /><meshStandardMaterial map={floorHub} roughness={0.55} metalness={0.12} /></mesh>
      {hubParts.map((g, i) => <mesh key={i} geometry={g} material={hubMat} />)}
      <mesh geometry={hubDome} material={hubDomeMat} />
      {ROOMS.map((r, i) => {
        const c = roomCenter(i);
        const a = ROOM_ANGLES[i];
        return (
          <group key={r.slug}>
            <group position={[Math.sin(a) * floorMid, 0, Math.cos(a) * floorMid]} rotation={[0, a, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow name="floor"><planeGeometry args={[TUNNEL_HALF * 2 + 0.4, floorLen]} /><meshStandardMaterial map={floorTun} roughness={0.55} metalness={0.12} /></mesh>
            </group>
            <group position={[Math.sin(a) * vaultMid, 0, Math.cos(a) * vaultMid]} rotation={[0, a, 0]}>
              <mesh geometry={vault} material={tunnelMats[i]} />
            </group>
            <group position={[c.x, 0, c.z]} rotation={[0, a + Math.PI, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow name="floor"><circleGeometry args={[ROOM_R + 0.7, 64]} /><meshStandardMaterial map={floorRoom} roughness={0.55} metalness={0.12} /></mesh>
              {roomParts.map((g, k) => <mesh key={k} geometry={g} material={roomMats[i]} />)}
              <mesh geometry={roomDome} material={roomDomes[i]} />
              <DoorFrame radius={ROOM_WALL} color={r.color} label="The Burrow" />
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** A door's face, set into the wall: dark bronze with one fine lit line around the arch, and a name above. */
function DoorFrame({ radius, color, label, angle = 0, onClick }: { radius: number; color: string; label: string; angle?: number; onClick?: () => void }) {
  const face = useMemo(() => doorSurround(ARCH_R, ARCH_R + 0.34, LINTEL + 0.08), []);
  useEffect(() => () => face.dispose(), [face]);
  const hover = onClick ? {
    onClick: (e: { stopPropagation: () => void; delta: number }) => { e.stopPropagation(); if (e.delta < 6) onClick(); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { document.body.style.cursor = ""; },
  } : {};
  return (
    <group position={[Math.sin(angle) * (radius - 0.08), 0, Math.cos(angle) * (radius - 0.08)]} rotation={[0, angle + Math.PI, 0]} {...hover}>
      <mesh geometry={face}><meshBasicMaterial color="#231e19" /></mesh>
      <mesh position={[0, 0, 0.03]}><torusGeometry args={[ARCH_R, 0.022, 6, 48, Math.PI]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * ARCH_R, 0.02, 0.03]}><cylinderGeometry args={[0.022, 0.022, 0.04, 6]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>)}
      <Text font={WORLD_FONT} position={[0, LINTEL + 0.48, 0.03]} fontSize={0.34} letterSpacing={0.14} anchorX="center" anchorY="middle">{label.toUpperCase()}<meshBasicMaterial color="#e9e2d2" side={THREE.FrontSide} toneMapped={false} /></Text>
    </group>
  );
}

/** Each room's doorway off the Burrow. Walk through it, or click it to go there. */
export function Portals() {
  const requestTravel = useWorld((s) => s.requestTravel);
  return <>{ROOMS.map((r, i) => <DoorFrame key={r.slug} radius={HUB_WALL} color={r.color} label={r.name} angle={ROOM_ANGLES[i]} onClick={() => requestTravel(r.slug)} />)}</>;
}
