import { RoomCore, signTicket, verifyReceipt, verifyTicket, type Conn, type TicketBody } from "@stm/shared";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../src/node";

const SECRET = "s".repeat(40);
const exp = () => Math.floor(Date.now() / 1000) + 300;
const body = (over: Partial<TicketBody> = {}): TicketBody => ({ u: "user-1", n: "ann", d: "Ann", c: "sandbath", q: "322", l: 2, exp: exp(), ...over });

function fake(): Conn & { got: any[]; closed: number | null } {
  const c = { got: [] as any[], closed: null as number | null, send(d: string) { c.got.push(JSON.parse(d)); }, close(code?: number) { c.closed = code ?? 1000; } };
  return c;
}
const find = (c: { got: any[] }, t: string) => c.got.filter((m) => m.t === t);
async function joined(room: RoomCore, ticket?: string) {
  const c = fake();
  room.connect(c);
  await room.message(c, JSON.stringify({ t: "hello", ticket }));
  return c;
}

describe("tickets", () => {
  it("accepts a signed ticket", async () => expect((await verifyTicket(await signTicket(body(), SECRET), SECRET))?.n).toBe("ann"));
  it("refuses a forged, altered or expired one", async () => {
    expect(await verifyTicket(await signTicket(body(), "x".repeat(40)), SECRET)).toBeNull();
    const t = await signTicket(body(), SECRET);
    const forged = `${btoa(JSON.stringify(body({ n: "squeektoshi" }))).replace(/=+$/, "")}.${t.split(".")[1]}`;
    expect(await verifyTicket(forged, SECRET)).toBeNull();
    expect(await verifyTicket(await signTicket(body({ exp: 10 }), SECRET), SECRET)).toBeNull();
    expect(await verifyTicket("garbage", SECRET)).toBeNull();
    expect(await verifyTicket(undefined, SECRET)).toBeNull();
    expect(await verifyTicket(t, "")).toBeNull();
  });
});

describe("the room", () => {
  it("shows a signed-in player's real name, crew and Squeek to others", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    await joined(room, await signTicket(body(), SECRET));
    const j = find(a, "join")[0];
    expect(j.player).toMatchObject({ name: "Ann", username: "ann", crew: "sandbath", squeekId: "322", squeekLevel: 2 });
  });
  it("names a guest Visitor, and nobody can pick a name by sending one", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    const b = fake();
    room.connect(b);
    await room.message(b, JSON.stringify({ t: "hello", name: "Squeektoshi", crew: "x", username: "admin" }));
    expect(find(a, "join")[0].player).toMatchObject({ username: null, crew: null });
    expect(find(a, "join")[0].player.name).toMatch(/^Visitor \d+$/);
  });
  it("tells a newcomer who's already here, and tells everyone when someone leaves", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    const b = await joined(room);
    expect(find(b, "welcome")[0].players).toHaveLength(1);
    room.leave(b);
    expect(find(a, "leave")).toHaveLength(1);
  });
  it("sends only movement that changed", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    const b = await joined(room);
    await room.message(b, JSON.stringify({ t: "p", x: 1.234, z: 2, yaw: 3, s: 7, r: 0 }));
    room.tick();
    const moved = find(a, "s").at(-1).p;
    expect(moved[0].slice(1)).toEqual([1.23, 2, 3, 7, 0]);
    const n = a.got.length;
    room.tick();
    expect(a.got.length).toBe(n);
  });
  it("ignores bad positions and junk", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    const b = await joined(room);
    for (const bad of [{ x: "1", z: 2, yaw: 0, s: 0 }, { x: 9999, z: 0, yaw: 0, s: 0 }, { x: null, z: 0, yaw: 0, s: 0 }, { x: 0, z: 0, yaw: 0, s: -1 }]) await room.message(b, JSON.stringify({ t: "p", ...bad }));
    await room.message(b, "{not json");
    await room.message(b, "x".repeat(2000));
    await room.message(b, JSON.stringify(null));
    room.tick();
    expect(find(a, "s")).toHaveLength(0);
  });
  it("ignores everything before hello", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await joined(room);
    const b = fake();
    room.connect(b);
    await room.message(b, JSON.stringify({ t: "emote", e: "wave" }));
    expect(find(a, "e")).toHaveLength(0);
  });
  it("only allows listed emotes, at a limited pace", async () => {
    let t = 5000;
    const room = new RoomCore({ secret: SECRET, now: () => t });
    const a = await joined(room);
    const b = await joined(room);
    await room.message(b, JSON.stringify({ t: "emote", e: "<script>" }));
    await room.message(b, JSON.stringify({ t: "emote", e: "wave" }));
    await room.message(b, JSON.stringify({ t: "emote", e: "wave" }));
    expect(find(a, "e")).toHaveLength(1);
    t += 1300;
    await room.message(b, JSON.stringify({ t: "emote", e: "cheese" }));
    expect(find(a, "e")).toHaveLength(2);
  });
  it("shows a hop to everyone else, at a limited pace", async () => {
    let t = 5000;
    const room = new RoomCore({ secret: SECRET, now: () => t });
    const a = await joined(room);
    const b = await joined(room);
    await room.message(b, JSON.stringify({ t: "hop" }));
    await room.message(b, JSON.stringify({ t: "hop" }));
    expect(find(a, "h")).toHaveLength(1);
    expect(find(b, "h")).toHaveLength(0);
    t += 600;
    await room.message(b, JSON.stringify({ t: "hop" }));
    expect(find(a, "h")).toHaveLength(2);
  });
  it("drops a connection that floods it", async () => {
    const room = new RoomCore({ secret: SECRET, now: () => 5000 });
    const b = await joined(room);
    for (let i = 0; i < 130; i++) await room.message(b, JSON.stringify({ t: "p", x: 0, z: 0, yaw: 0, s: 0 }));
    expect(b.closed).toBe(4003);
    expect(room.size).toBe(0);
  });
  it("turns people away when full, kindly", async () => {
    const room = new RoomCore({ secret: SECRET, cap: 1 });
    await joined(room);
    const b = await joined(room);
    expect(find(b, "full")).toHaveLength(1);
    expect(b.closed).toBe(4001);
  });
  it("gives one person one hamster across tabs", async () => {
    const room = new RoomCore({ secret: SECRET });
    const t = await signTicket(body(), SECRET);
    const a = await joined(room, t);
    await joined(room, t);
    expect(a.closed).toBe(4002);
    expect(room.size).toBe(1);
  });
});

describe("running together", () => {
  async function riders(room: RoomCore, n: number, code = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = await joined(room);
      await room.message(c, JSON.stringify({ t: "p", x: 0, z: 0, yaw: 0, s: 0, r: code }));
      out.push(c);
    }
    return out;
  }
  it("adds everyone's taps together, so a crew goes faster than one runner", async () => {
    let t = 0;
    const room = new RoomCore({ secret: SECRET, now: () => t });
    const [a, b, c] = await riders(room, 3);
    room.tick();
    for (const x of [a, b, c]) await room.message(x, JSON.stringify({ t: "tap" }));
    t += 200;
    room.tick();
    const w = find(a, "s").at(-1).w["1"];
    expect(w[1]).toBe(3);
    expect(w[0]).toBeGreaterThan(20);
    expect(room.wheels[1].rpm).toBeGreaterThan(11);
  });
  it("won't count a tap from someone not on a wheel, and stops the wheel when everyone gets off", async () => {
    let t = 0;
    const room = new RoomCore({ secret: SECRET, now: () => t });
    const walker = await joined(room);
    await room.message(walker, JSON.stringify({ t: "tap" }));
    expect(room.wheels[1].rpm).toBe(0);
    const [r] = await riders(room, 1);
    await room.message(r, JSON.stringify({ t: "tap" }));
    t += 200;
    room.tick();
    await room.message(r, JSON.stringify({ t: "p", x: 0, z: 0, yaw: 0, s: 0, r: 0 }));
    t += 200;
    room.tick();
    expect(room.wheels[1].rpm).toBe(0);
    expect(find(walker, "s").at(-1).w["1"]).toEqual([0, 0]);
  });
});

describe("receipts", () => {
  const tick = async (room: RoomCore) => { room.tick(); await new Promise((r) => setTimeout(r, 15)); };
  const signed = (room: RoomCore, u: string) => signTicket(body({ u, n: u }), SECRET).then((t) => joined(room, t));
  it("gives one for saying hello only when someone's actually nearby", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await signed(room, "a");
    await room.message(a, JSON.stringify({ t: "emote", e: "wave" }));
    await tick(room);
    expect(find(a, "proof")).toHaveLength(0);
    const b = await signed(room, "b");
    await new Promise((r) => setTimeout(r, 1300));
    await room.message(a, JSON.stringify({ t: "emote", e: "wave" }));
    await tick(room);
    expect(await verifyReceipt(find(a, "proof")[0].proof, SECRET, "a", "hello")).toBe(true);
    expect(find(b, "proof")).toHaveLength(0);
  });
  it("gives one for running together only to a signed-in rider who really ran with someone", async () => {
    const room = new RoomCore({ secret: SECRET });
    const a = await signed(room, "a");
    const b = await signed(room, "b");
    const guest = await joined(room);
    for (const c of [a, b, guest]) await room.message(c, JSON.stringify({ t: "p", x: 0, z: 0, yaw: 0, s: 0, r: 2 }));
    await tick(room);
    expect(find(a, "proof")).toHaveLength(0);
    await room.message(a, JSON.stringify({ t: "tap", n: 2 }));
    await room.message(guest, JSON.stringify({ t: "tap" }));
    await tick(room);
    await tick(room);
    expect(find(a, "proof")).toHaveLength(1);
    expect(find(b, "proof")).toHaveLength(0);
    expect(find(guest, "proof")).toHaveLength(0);
  });
  it("can't be used for someone else, for another task, or as a ticket", async () => {
    const proof = await signTicket({ u: "a", k: "hello", exp: exp() }, SECRET);
    expect(await verifyReceipt(proof, SECRET, "b", "hello")).toBe(false);
    expect(await verifyReceipt(proof, SECRET, "a", "together")).toBe(false);
    expect(await verifyReceipt(proof, "x".repeat(40), "a", "hello")).toBe(false);
    expect(await verifyTicket(proof, SECRET)).toBeNull();
    expect(await verifyReceipt(await signTicket(body({ u: "a" }), SECRET), SECRET, "a", "hello")).toBe(false);
  });
});

describe("the real server", () => {
  const open = (port: number, origin = "http://localhost:3300") => new Promise<{ ws: WebSocket; got: any[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const got: any[] = [];
    ws.on("message", (d) => got.push(JSON.parse(d.toString())));
    ws.on("open", () => resolve({ ws, got }));
    ws.on("error", reject);
  });
  const until = async (f: () => boolean) => {
    for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20));
    expect(f()).toBe(true);
  };
  it("relays movement between two real connections, and refuses other sites", async () => {
    const server = await startServer({ port: 0, host: "127.0.0.1", secret: SECRET, origins: ["http://localhost:3300"] });
    const a = await open(server.port);
    const b = await open(server.port);
    a.ws.send(JSON.stringify({ t: "hello" }));
    b.ws.send(JSON.stringify({ t: "hello" }));
    await until(() => a.got.some((m) => m.t === "welcome") && b.got.some((m) => m.t === "welcome"));
    b.ws.send(JSON.stringify({ t: "p", x: 5, z: 6, yaw: 1, s: 2, r: 0 }));
    await until(() => a.got.some((m) => m.t === "s" && m.p.some((p: number[]) => p[1] === 5)));
    await expect(open(server.port, "https://evil.example")).rejects.toThrow();
    a.ws.close();
    b.ws.close();
    await server.close();
  });
});
