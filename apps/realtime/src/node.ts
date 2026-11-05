import { ROOM_CAP, RoomCore, TICK_MS, type Conn } from "@stm/shared";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

/** The room on a plain Node server, for local work or self-hosting. Cloudflare's version is in worker.ts. */
export function startServer(opts: { port: number; host: string; secret: string; origins: string[]; cap?: number }) {
  const room = new RoomCore({ secret: opts.secret, cap: opts.cap ?? ROOM_CAP });
  const http = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, players: room.size }));
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 1024, verifyClient: ({ origin }: { origin: string }) => opts.origins.includes(origin) });
  wss.on("connection", (ws: WebSocket) => {
    const conn: Conn = { send: (d) => ws.send(d), close: (c, r) => ws.close(c, r) };
    room.connect(conn);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) void room.message(conn, data.toString());
    });
    ws.on("close", () => room.leave(conn));
    ws.on("error", () => room.leave(conn));
  });
  const timer = setInterval(() => room.tick(), TICK_MS);
  return new Promise<{ port: number; room: RoomCore; close: () => Promise<void> }>((resolve) => {
    http.listen(opts.port, opts.host, () => {
      const addr = http.address();
      resolve({
        port: typeof addr === "object" && addr ? addr.port : opts.port,
        room,
        close: () => new Promise((done) => {
          clearInterval(timer);
          room.shutdown();
          wss.close();
          http.close(() => done());
        }),
      });
    });
  });
}

if (require.main === module) {
  const secret = process.env.REALTIME_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    console.error("REALTIME_SECRET must be at least 32 characters");
    process.exit(1);
  }
  const origins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3300").split(",").map((s) => s.trim());
  void startServer({ port: Number(process.env.PORT ?? 4400), host: process.env.HOST ?? "127.0.0.1", secret, origins }).then((s) => console.log(`Realtime room on :${s.port}`));
}
