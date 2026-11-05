import { sendHop } from "@/lib/multiplayer";

const LIFT = 5.2;
const GRAVITY = 14;

/** The hop you trigger yourself. It's only height, so walking and steering carry on underneath it. */
export const hop = { y: 0, v: 0 };

export function hopStart() {
  if (hop.y > 0 || hop.v > 0) return;
  hop.v = LIFT;
  sendHop();
}

/** Moves any hopper one step. Returns the new height and speed. */
export function hopStep(y: number, v: number, dt: number): [number, number] {
  if (y === 0 && v === 0) return [0, 0];
  const nextV = v - GRAVITY * dt;
  const nextY = y + v * dt;
  return nextY <= 0 ? [0, 0] : [nextY, nextV];
}

export function hopUpdate(dt: number) {
  [hop.y, hop.v] = hopStep(hop.y, hop.v, dt);
}
