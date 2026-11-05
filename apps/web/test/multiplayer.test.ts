import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn(), useApi: vi.fn() }));
import { hop, hopStart, hopStep, hopUpdate } from "../components/world/hop";
import { MAX_RPM, ride, rideTap, rideUpdate } from "../components/world/ride";
import { net, publish } from "../lib/multiplayer";

describe("hopping", () => {
  it("does nothing on its own: walking never lifts you off the floor", () => {
    expect(hopStep(0, 0, 0.016)).toEqual([0, 0]);
    hopUpdate(0.016);
    expect(hop.y).toBe(0);
  });
  it("goes up, comes down and lands exactly on the floor", () => {
    hopStart();
    let peak = 0, frames = 0;
    do {
      hopUpdate(1 / 60);
      peak = Math.max(peak, hop.y);
      frames++;
    } while (hop.y > 0 && frames < 300);
    expect(peak).toBeGreaterThan(0.7);
    expect(peak).toBeLessThan(1.3);
    expect(frames).toBeLessThan(60);
    expect([hop.y, hop.v]).toEqual([0, 0]);
  });
  it("can't be restarted mid-air", () => {
    hopStart();
    hopUpdate(0.1);
    const v = hop.v;
    hopStart();
    expect(hop.v).toBe(v);
    hop.y = hop.v = 0;
  });
});

describe("running together", () => {
  it("pulls a slower runner up to the crew's speed, up to the limit", () => {
    ride.rpm = 20;
    ride.boost = 0;
    rideUpdate(0.1, 120);
    expect(ride.rpm).toBeGreaterThan(20);
    ride.rpm = 250;
    for (let i = 0; i < 60; i++) rideUpdate(0.05, 400);
    expect(ride.rpm).toBeLessThanOrEqual(MAX_RPM);
    ride.rpm = 0;
  });
  it("leaves a solo run alone", () => {
    ride.rpm = 50;
    rideUpdate(0.1);
    expect(ride.rpm).toBeLessThan(50);
    ride.rpm = 0;
  });
  it("queues steps for the room", () => {
    net.taps = 0;
    ride.boost = 1;
    rideTap();
    expect(net.taps).toBe(1);
    expect(net.boosted).toBe(true);
    net.taps = 0;
    net.boosted = false;
    ride.boost = 0;
    ride.rpm = 0;
  });
});

describe("staying quiet offline", () => {
  it("sends nothing until the room has welcomed you", () => {
    net.selfId = null;
    expect(() => publish({ x: 1, z: 2, yaw: 0, speed: 3 }, 0, 1000)).not.toThrow();
  });
});

describe("published without an API", () => {
  it("makes no network calls, and says why", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/api");
    vi.stubEnv("NEXT_PUBLIC_API_OFFLINE", "1");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { api } = await import("../lib/api");
    await expect(api("/world/state")).rejects.toThrow(/isn't online yet/);
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
