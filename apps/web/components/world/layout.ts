import { ROOMS, type RoomSlug } from "@stm/shared";

export const HUB_R = 25;
export const ROOM_R = 16;
export const TUNNEL_LEN = 16;
export const TUNNEL_HALF = 2.6;
export const WHEEL_BLOCK_R = 8.2;
const AVATAR_R = 0.6;

export const ROOM_ANGLES = ROOMS.map((_, i) => (i / ROOMS.length) * Math.PI * 2 + Math.PI);
export const roomDistance = HUB_R + TUNNEL_LEN + ROOM_R - 2;

export interface V2 { x: number; z: number }

export function roomCenter(i: number): V2 {
  return { x: Math.sin(ROOM_ANGLES[i]) * roomDistance, z: Math.cos(ROOM_ANGLES[i]) * roomDistance };
}
export const roomIndex = (slug: RoomSlug) => ROOMS.findIndex((r) => r.slug === slug);

/** A point in one room's own frame, where +z faces back toward the hub. */
export function roomPoint(i: number, lx: number, lz: number): V2 {
  const c = roomCenter(i);
  const a = ROOM_ANGLES[i];
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: c.x - lx * cos - lz * sin, z: c.z + lx * sin - lz * cos };
}

/** Solid things inside the walkable space. Rooms add their own. */
export const OBSTACLES: { x: number; z: number; r: number }[] = [{ x: 0, z: 0, r: WHEEL_BLOCK_R }];

export function addObstacles(list: { x: number; z: number; r: number }[]) {
  OBSTACLES.push(...list);
  return () => {
    for (const o of list) {
      const i = OBSTACLES.indexOf(o);
      if (i >= 0) OBSTACLES.splice(i, 1);
    }
  };
}

function inTunnel(p: V2, i: number): boolean {
  const a = ROOM_ANGLES[i];
  const along = p.x * Math.sin(a) + p.z * Math.cos(a);
  const across = p.x * Math.cos(a) - p.z * Math.sin(a);
  return along > HUB_R - 2 && along < roomDistance - ROOM_R + 2 && Math.abs(across) < TUNNEL_HALF - AVATAR_R;
}

export function isOpenFloor(p: V2): boolean {
  if (Math.hypot(p.x, p.z) < HUB_R - AVATAR_R) return true;
  for (let i = 0; i < ROOMS.length; i++) {
    const c = roomCenter(i);
    if (Math.hypot(p.x - c.x, p.z - c.z) < ROOM_R - AVATAR_R) return true;
    if (inTunnel(p, i)) return true;
  }
  return false;
}

export function isWalkable(p: V2): boolean {
  if (!isOpenFloor(p)) return false;
  return !OBSTACLES.some((o) => Math.hypot(p.x - o.x, p.z - o.z) < o.r + AVATAR_R);
}

/** Moves as far as the floor allows, sliding along walls instead of stopping dead. */
export function step(from: V2, dx: number, dz: number): V2 {
  const both = { x: from.x + dx, z: from.z + dz };
  if (isWalkable(both)) return both;
  // Slide only when that axis carries real movement. A near-zero slide would look like being stuck.
  const size = Math.hypot(dx, dz);
  const xOnly = { x: from.x + dx, z: from.z };
  if (Math.abs(dx) > size * 0.25 && isWalkable(xOnly)) return xOnly;
  const zOnly = { x: from.x, z: from.z + dz };
  if (Math.abs(dz) > size * 0.25 && isWalkable(zOnly)) return zOnly;
  // Head-on into something round neither axis works, so steer around it.
  for (const turn of [0.6, -0.6, 1.2, -1.2, 1.57, -1.57]) {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const veer = { x: from.x + dx * cos - dz * sin, z: from.z + dx * sin + dz * cos };
    if (isWalkable(veer)) return veer;
  }
  return from;
}

export function locate(p: V2): RoomSlug | "hub" | "tunnel" {
  if (Math.hypot(p.x, p.z) < HUB_R) return "hub";
  for (let i = 0; i < ROOMS.length; i++) {
    const c = roomCenter(i);
    if (Math.hypot(p.x - c.x, p.z - c.z) < ROOM_R) return ROOMS[i].slug;
  }
  return "tunnel";
}

/** Where a visitor lands when travelling: just inside the door, looking into the room. */
export function arrivalPoint(target: RoomSlug | "hub"): { x: number; z: number; yaw: number } {
  if (target === "hub") return { x: 0, z: 17, yaw: Math.PI };
  const i = roomIndex(target);
  const p = roomPoint(i, 0, 7);
  return { x: p.x, z: p.z, yaw: ROOM_ANGLES[i] };
}
