/**
 * Multiplayer room logic. It has no idea what's hosting it: the same class runs on a plain Node
 * server and inside a Cloudflare Durable Object. Nothing here is saved, and no position is logged.
 */
export const ROOM_CAP = 60;
export const TICK_MS = 200;
export const EMOTES = ["wave", "squeek", "cheese", "wheel"] as const;
export type Emote = (typeof EMOTES)[number];
/** 0 walking, 1 on the Burrow's giant wheel, 2 on the Wheel Room's practice wheel. */
export type RideCode = 0 | 1 | 2;

export interface TicketBody { u: string; n: string; d: string | null; c: string | null; q: string | null; l: number | null; exp: number }

export type RoomTask = "together" | "hello";
export interface ReceiptBody { u: string; k: RoomTask; exp: number }

export interface PlayerInfo { id: number; name: string; username: string | null; crew: string | null; squeekId: string | null; squeekLevel: number | null }

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** A short-lived pass from the API, so a name and crew shown to others can't be made up. */
export async function signTicket(body: TicketBody | ReceiptBody, secret: string): Promise<string> {
  const payload = b64(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), new TextEncoder().encode(payload));
  return `${payload}.${b64(new Uint8Array(sig))}`;
}

export async function verifyTicket(ticket: unknown, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<TicketBody | null> {
  if (typeof ticket !== "string" || ticket.length > 1000 || !secret) return null;
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), unb64(sig), new TextEncoder().encode(payload));
    if (!ok) return null;
    const body = JSON.parse(new TextDecoder().decode(unb64(payload))) as TicketBody;
    return typeof body.exp === "number" && body.exp > nowSeconds && typeof body.u === "string" && typeof body.n === "string" ? body : null;
  } catch {
    return null;
  }
}

/** The room's signed word that a signed-in player did something only it can see. It can't be used as a ticket, or the other way round. */
export async function verifyReceipt(proof: unknown, secret: string, userId: string, task: RoomTask, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (typeof proof !== "string" || proof.length > 1000 || !secret) return false;
  const [payload, sig] = proof.split(".");
  if (!payload || !sig) return false;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), unb64(sig), new TextEncoder().encode(payload)))) return false;
    const body = JSON.parse(new TextDecoder().decode(unb64(payload))) as ReceiptBody;
    return body.u === userId && body.k === task && typeof body.exp === "number" && body.exp > nowSeconds;
  } catch {
    return false;
  }
}

export const TASK_DEFS = [
  { slug: "call", name: "Call the next shift", how: "Make your call in The Great Dig. Being right scores extra when the shift settles.", points: 10 },
  { slug: "chain", name: "Contribute on chain", how: "Send a real contribution from the Contribute panel, then get it counted.", points: 10 },
  { slug: "memory", name: "Write a memory", how: "Add a memory or observation to the archive.", points: 5 },
  { slug: "together", name: "Run a wheel together", how: "Get on the same practice wheel as another player and run.", points: 5 },
  { slug: "hello", name: "Say hello", how: "Send an emote while another player is close by.", points: 3 },
] as const;
export type TaskSlug = (typeof TASK_DEFS)[number]["slug"];
export const isTask = (v: unknown): v is TaskSlug => TASK_DEFS.some((t) => t.slug === v);

export interface Conn { send(data: string): void; close(code?: number, reason?: string): void }

interface Seat extends PlayerInfo {
  conn: Conn; ready: boolean; userId: string | null; x: number; z: number; yaw: number; s: number; r: RideCode; dirty: boolean;
  windowStart: number; windowCount: number; lastEmote: number; lastHop: number; tapped: boolean; proved: Set<RoomTask>;
}

const MAX_MESSAGE = 512;
const SOFT_RATE = 30; // Messages a second before extras are ignored.
const HARD_RATE = 120; // Before the connection is dropped.
const FADE = (rpm: number, dt: number) => Math.max(0, rpm - (rpm * 0.9 + 6) * dt);
const WHEEL_CAP = 400;
const round = (v: number) => Math.round(v * 100) / 100;
const HELLO_RANGE = 12;
const RECEIPT_SECONDS = 3600;

export class RoomCore {
  private readonly seats = new Map<Conn, Seat>();
  private nextId = 1;
  private lastTick = 0;
  readonly wheels = { 1: { rpm: 0, riders: 0, sent: false }, 2: { rpm: 0, riders: 0, sent: false } };

  constructor(private readonly opts: { secret: string; cap?: number; now?: () => number }) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }
  get size() {
    return [...this.seats.values()].filter((s) => s.ready).length;
  }

  connect(conn: Conn) {
    this.seats.set(conn, { conn, ready: false, userId: null, id: this.nextId++, name: "", username: null, crew: null, squeekId: null, squeekLevel: null, x: 0, z: 12, yaw: Math.PI, s: 0, r: 0, dirty: false, windowStart: this.now(), windowCount: 0, lastEmote: 0, lastHop: 0, tapped: false, proved: new Set() });
  }

  leave(conn: Conn) {
    const seat = this.seats.get(conn);
    if (!seat) return;
    this.seats.delete(conn);
    if (seat.ready) this.broadcast({ t: "leave", id: seat.id });
  }

  private info(s: Seat): PlayerInfo {
    return { id: s.id, name: s.name, username: s.username, crew: s.crew, squeekId: s.squeekId, squeekLevel: s.squeekLevel };
  }

  private broadcast(msg: unknown, except?: Conn) {
    const data = JSON.stringify(msg);
    for (const s of this.seats.values()) {
      if (s.ready && s.conn !== except) this.safeSend(s.conn, data);
    }
  }

  private safeSend(conn: Conn, data: string) {
    try {
      conn.send(data);
    } catch {
      this.leave(conn);
    }
  }

  private async hello(seat: Seat, ticket: unknown) {
    if (seat.ready) return;
    const cap = this.opts.cap ?? ROOM_CAP;
    if (this.size >= cap) {
      this.safeSend(seat.conn, JSON.stringify({ t: "full" }));
      seat.conn.close(4001, "full");
      this.leave(seat.conn);
      return;
    }
    const body = await verifyTicket(ticket, this.opts.secret, Math.floor(this.now() / 1000));
    if (!this.seats.has(seat.conn) || seat.ready) return;
    if (body) {
      // One hamster per person: a second tab takes over from the first.
      for (const other of this.seats.values()) {
        if (other !== seat && other.userId === body.u) {
          other.conn.close(4002, "replaced");
          this.leave(other.conn);
        }
      }
      seat.userId = body.u;
      seat.username = body.n;
      seat.name = body.d ?? body.n;
      seat.crew = body.c;
      seat.squeekId = body.q;
      seat.squeekLevel = body.l;
    } else seat.name = `Visitor ${seat.id}`;
    seat.ready = true;
    const others = [...this.seats.values()].filter((s) => s.ready && s !== seat).map((s) => ({ ...this.info(s), x: s.x, z: s.z, yaw: s.yaw, s: s.s, r: s.r }));
    this.safeSend(seat.conn, JSON.stringify({ t: "welcome", id: seat.id, name: seat.name, players: others }));
    this.broadcast({ t: "join", player: { ...this.info(seat), x: seat.x, z: seat.z, yaw: seat.yaw, s: 0, r: 0 } }, seat.conn);
  }

  /** Accepts only well-formed, in-range values. Names and crews can only come from a signed ticket. */
  async message(conn: Conn, raw: unknown) {
    const seat = this.seats.get(conn);
    if (!seat || typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    const now = this.now();
    if (now - seat.windowStart >= 1000) {
      seat.windowStart = now;
      seat.windowCount = 0;
    }
    seat.windowCount++;
    if (seat.windowCount > HARD_RATE) {
      conn.close(4003, "too fast");
      this.leave(conn);
      return;
    }
    if (seat.windowCount > SOFT_RATE) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (m.t === "hello") return this.hello(seat, m.ticket);
    if (!seat.ready) return;
    if (m.t === "p") {
      const { x, z, yaw, s, r } = m;
      if (![x, z, yaw, s].every((v) => typeof v === "number" && Number.isFinite(v))) return;
      if (Math.abs(x as number) > 130 || Math.abs(z as number) > 130 || (s as number) < 0 || (s as number) > 40 || Math.abs(yaw as number) > 100) return;
      seat.x = round(x as number);
      seat.z = round(z as number);
      seat.yaw = round(yaw as number);
      seat.s = round(s as number);
      seat.r = r === 1 || r === 2 ? r : 0;
      seat.dirty = true;
    } else if (m.t === "tap") {
      if (seat.r === 0) return;
      const wheel = this.wheels[seat.r];
      const n = typeof m.n === "number" && Number.isInteger(m.n) ? Math.min(Math.max(m.n, 1), 10) : 1;
      wheel.rpm = Math.min(WHEEL_CAP, wheel.rpm + n * (m.b === 1 ? 29 : 11));
      seat.tapped = true;
    } else if (m.t === "hop") {
      if (now - seat.lastHop < 500) return;
      seat.lastHop = now;
      this.broadcast({ t: "h", id: seat.id }, conn);
    } else if (m.t === "emote") {
      if (!(["wave", "squeek", "cheese", "wheel"] as unknown[]).includes(m.e) || now - seat.lastEmote < 1200) return;
      seat.lastEmote = now;
      this.broadcast({ t: "e", id: seat.id, e: m.e });
      const near = [...this.seats.values()].some((o) => o !== seat && o.ready && Math.hypot(o.x - seat.x, o.z - seat.z) <= HELLO_RANGE);
      if (near) void this.prove(seat, "hello");
    }
  }

  /** One receipt per connection per task. A guest has no account to credit, so gets none. */
  private async prove(seat: Seat, k: RoomTask) {
    if (!seat.userId || seat.proved.has(k)) return;
    seat.proved.add(k);
    const proof = await signTicket({ u: seat.userId, k, exp: Math.floor(this.now() / 1000) + RECEIPT_SECONDS }, this.opts.secret);
    this.safeSend(seat.conn, JSON.stringify({ t: "proof", k, proof }));
  }

  /** Sends only what changed since last time, so a quiet room costs almost nothing. */
  tick() {
    const now = this.now();
    const dt = this.lastTick ? Math.min(1, (now - this.lastTick) / 1000) : TICK_MS / 1000;
    this.lastTick = now;
    const moved: number[][] = [];
    const counts = { 1: 0, 2: 0 };
    for (const s of this.seats.values()) {
      if (!s.ready) continue;
      if (s.r) counts[s.r]++;
      if (s.dirty) {
        moved.push([s.id, s.x, s.z, s.yaw, s.s, s.r]);
        s.dirty = false;
      }
    }
    const wheels: Record<string, [number, number]> = {};
    for (const code of [1, 2] as const) {
      const w = this.wheels[code];
      w.riders = counts[code];
      w.rpm = w.riders ? FADE(w.rpm, dt) : 0;
      if (w.riders || w.sent) wheels[code] = [Math.round(w.rpm), w.riders];
      w.sent = w.riders > 0;
    }
    for (const s of this.seats.values()) {
      if (s.ready && s.r && s.tapped && this.wheels[s.r].riders >= 2) void this.prove(s, "together");
    }
    if (moved.length || Object.keys(wheels).length) this.broadcast({ t: "s", p: moved, w: wheels });
  }

  /** The room's closing a connection it decided to end, or the host telling it one has gone. */
  shutdown() {
    for (const s of [...this.seats.values()]) s.conn.close(1001, "closing");
    this.seats.clear();
  }
}
