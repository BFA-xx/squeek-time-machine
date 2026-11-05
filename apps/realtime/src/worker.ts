import { ROOM_CAP, RoomCore, TICK_MS, type Conn } from "@stm/shared";

/* Just enough of Cloudflare's runtime types to keep this file checked. */
declare const WebSocketPair: { new (): { 0: CfSocket; 1: CfSocket } };
interface CfSocket { accept(): void; send(d: string): void; close(c?: number, r?: string): void; addEventListener(t: "message" | "close" | "error", f: (e: { data?: unknown }) => void): void }
interface Env { REALTIME_SECRET: string; ALLOWED_ORIGINS: string; BURROW: { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } } }

/**
 * One burrow room. It only uses compute while someone is connected: the timer stops when the last
 * player leaves, so an empty game costs nothing on the free plan.
 */
export class BurrowRoom {
  private readonly room: RoomCore;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(_state: unknown, env: Env) {
    this.room = new RoomCore({ secret: env.REALTIME_SECRET, cap: ROOM_CAP });
  }

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const conn: Conn = { send: (d) => server.send(d), close: (c, r) => server.close(c, r) };
    this.room.connect(conn);
    const gone = () => {
      this.room.leave(conn);
      if (this.room.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    server.addEventListener("message", (e) => void this.room.message(conn, e.data));
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    this.timer ??= setInterval(() => this.room.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: unknown });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/healthz") return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const origin = request.headers.get("origin") ?? "";
    if (!env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin)) return new Response("Origin not allowed", { status: 403 });
    return env.BURROW.get(env.BURROW.idFromName("burrow")).fetch(request);
  },
};
