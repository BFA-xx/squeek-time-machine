import { ROOMS } from "@stm/shared";
import { describe, expect, it } from "vitest";
import { HUB_R, ROOM_R, addObstacles, arrivalPoint, isOpenFloor, isWalkable, locate, roomCenter, roomPoint, step } from "@/components/world/layout";

describe("world navigation", () => {
  it("every room is reachable on foot from the hub through its tunnel", () => {
    ROOMS.forEach((_, i) => {
      const c = roomCenter(i);
      const len = Math.hypot(c.x, c.z);
      for (let d = 10; d <= len; d += 0.5) {
        expect(isOpenFloor({ x: (c.x / len) * d, z: (c.z / len) * d }), `room ${i} at ${d}`).toBe(true);
      }
    });
  });
  it("the wheel blocks the middle of the hub", () => {
    expect(isOpenFloor({ x: 0, z: 0 })).toBe(true);
    expect(isWalkable({ x: 0, z: 0 })).toBe(false);
  });
  it("the cave walls stop you", () => {
    const mid = (Math.PI * 2) / ROOMS.length / 2;
    expect(isOpenFloor({ x: Math.sin(Math.PI + mid) * (HUB_R + 1), z: Math.cos(Math.PI + mid) * (HUB_R + 1) })).toBe(false);
    expect(isOpenFloor({ x: 500, z: 500 })).toBe(false);
  });
  it("walking into a wall slides along it, and never crosses it", () => {
    let p = { x: 0, z: HUB_R - 1 };
    for (let i = 0; i < 200; i++) p = step(p, 0.1, 0.25);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(HUB_R + 0.5);
    expect(p.x).toBeGreaterThan(1);
  });
  it("walks around a round obstacle instead of stopping dead", () => {
    const remove = addObstacles([{ x: 0, z: 14, r: 1 }]);
    let p = { x: 0.01, z: 17 };
    for (let i = 0; i < 80; i++) p = step(p, 0, -0.1);
    remove();
    expect(p.z).toBeLessThan(12.5);
  });
  it("a room's own obstacles can be added and removed", () => {
    const at = roomPoint(0, 3, 3);
    expect(isWalkable(at)).toBe(true);
    const remove = addObstacles([{ ...at, r: 1 }]);
    expect(isWalkable(at)).toBe(false);
    remove();
    expect(isWalkable(at)).toBe(true);
  });
  it("travel always lands on open floor, inside the right room", () => {
    ROOMS.forEach((r) => {
      const p = arrivalPoint(r.slug);
      expect(isWalkable(p)).toBe(true);
      expect(locate(p)).toBe(r.slug);
      const c = roomCenter(ROOMS.findIndex((x) => x.slug === r.slug));
      const look = { x: p.x + Math.sin(p.yaw), z: p.z + Math.cos(p.yaw) };
      expect(Math.hypot(look.x - c.x, look.z - c.z)).toBeLessThan(Math.hypot(p.x - c.x, p.z - c.z));
    });
    expect(locate(arrivalPoint("hub"))).toBe("hub");
    expect(ROOM_R).toBeGreaterThan(0);
  });
  it("hidden seeds sit on open floor", async () => {
    const { SEEDS } = await import("@/components/panels/discoveries");
    for (const s of SEEDS) {
      const i = ROOMS.findIndex((r) => r.slug === s.room);
      const at = s.room === "hub" ? { x: s.at[0], z: s.at[1] } : roomPoint(i, s.at[0], s.at[1]);
      expect(isOpenFloor(at), s.slug).toBe(true);
    }
  });
});
