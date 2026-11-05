import { ROOMS } from "@stm/shared";
import { describe, expect, it, vi } from "vitest";
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
    const mid = Math.PI + Math.PI / ROOMS.length;
    let p = { x: Math.sin(mid) * (HUB_R - 1), z: Math.cos(mid) * (HUB_R - 1) };
    const start = { ...p };
    const out = { x: Math.sin(mid), z: Math.cos(mid) };
    const along = { x: Math.cos(mid), z: -Math.sin(mid) };
    for (let i = 0; i < 30; i++) p = step(p, out.x * 0.25 + along.x * 0.1, out.z * 0.25 + along.z * 0.1);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(HUB_R + 0.5);
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeGreaterThan(1);
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

describe("using things up close", () => {
  it("offers the nearest thing, and nothing out of reach", async () => {
    const { addSpots, nearestSpot } = await import("@/components/world/spots");
    const remove = addSpots([
      { key: "a", x: 0, z: 0, r: 3, label: "A", action: () => {} },
      { key: "b", x: 4, z: 0, r: 3, label: "B", action: () => {} },
    ]);
    expect(nearestSpot({ x: 1, z: 0 })?.key).toBe("a");
    expect(nearestSpot({ x: 3.5, z: 0 })?.key).toBe("b");
    expect(nearestSpot({ x: 50, z: 0 })).toBeNull();
    remove();
    expect(nearestSpot({ x: 1, z: 0 })).toBeNull();
  });
  it("the practice wheel speeds up with taps and slows when you stop", async () => {
    const { ride, rideStart, rideTap, rideUpdate } = await import("@/components/world/ride");
    rideStart();
    for (let i = 0; i < 5; i++) rideTap();
    expect(ride.rpm).toBe(55);
    ride.boost = 1;
    rideTap();
    expect(ride.rpm).toBe(84);
    ride.boost = 0;
    ride.rpm = 55;
    rideUpdate(0.1);
    expect(ride.rpm).toBeLessThan(55);
    expect(ride.distanceMm).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) rideUpdate(0.1);
    expect(ride.rpm).toBe(0);
  });
});

describe("PS5 controller", () => {
  it("ignores stick drift and reaches full speed at full tilt", async () => {
    const { deadzone } = await import("@/components/world/gamepad");
    expect(deadzone(0.1)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-1)).toBe(-1);
  });
  it("cycles through the hub and every room, both ways", async () => {
    const { nextRoom } = await import("@/components/world/gamepad");
    expect(nextRoom("hub", 1)).toBe("dig");
    expect(nextRoom("hub", -1)).toBe("future");
    expect(nextRoom("future", 1)).toBe("hub");
    expect(nextRoom("tunnel", 1)).toBe("dig");
  });
  it("holding R2 makes each X tap worth more, and can pass what plain tapping reaches", async () => {
    const { ride, rideStart, rideTap, rideUpdate, MAX_RPM, rideTier } = await import("@/components/world/ride");
    const run = (boost: number) => {
      rideStart();
      ride.boost = boost;
      for (let i = 0; i < 90; i++) {
        rideTap();
        for (let k = 0; k < 10; k++) rideUpdate(0.0167); // Six taps a second.
      }
      return ride.rpm;
    };
    const plain = run(0);
    const boosted = run(1);
    expect(plain).toBeLessThan(90);
    expect(boosted).toBeGreaterThan(plain * 2);
    expect(boosted).toBeLessThanOrEqual(MAX_RPM);
    expect(rideTier(boosted)).toBe("OVERDRIVE");
  });
  it("reads R2 as boost and sprint, and D-pad as zoom", async () => {
    const { pollGamepad, PAD } = await import("@/components/world/gamepad");
    const { input } = await import("@/components/world/input");
    const { ride } = await import("@/components/world/ride");
    const { useWorld } = await import("@/lib/store");
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    buttons[PAD.r2] = { pressed: true, touched: true, value: 0.5 };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [{ connected: true, axes: [0, 0, 0, 0], buttons }] });
    useWorld.setState({ panel: null, ride: false });
    pollGamepad(0.016);
    expect(input.padBoost).toBe(0.5);
    useWorld.setState({ ride: "hub" });
    pollGamepad(0.016);
    expect(ride.boost).toBe(0.5);
    useWorld.setState({ ride: false });
  });
  it("moves, uses and goes back with a mocked pad", async () => {
    const { pollGamepad } = await import("@/components/world/gamepad");
    const { input } = await import("@/components/world/input");
    const { useWorld } = await import("@/lib/store");
    const action = vi.fn();
    useWorld.setState({ panel: null, prompt: { label: "x", action }, ride: false });
    const button = (pressed = false) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    const pad = (buttons: Record<number, boolean>) => ({ connected: true, axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => button(!!buttons[i])) });
    let current = pad({});
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [current] });
    pollGamepad(0.016);
    expect(input.padY).toBe(-1);
    current = pad({ 0: true });
    pollGamepad(0.016);
    pollGamepad(0.016);
    expect(action).toHaveBeenCalledTimes(1);
    useWorld.setState({ panel: { kind: "search" }, history: [] });
    current = pad({ 1: true });
    pollGamepad(0.016);
    expect(useWorld.getState().panel).toBeNull();
    useWorld.setState({ ride: "wheel", panel: null });
    current = pad({});
    pollGamepad(0.016);
    current = pad({ 1: true });
    pollGamepad(0.016);
    expect(useWorld.getState().ride).toBe(false);
  });
});
