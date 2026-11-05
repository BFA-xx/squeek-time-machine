import { Controller, Get, MessageEvent, Param, Query, Sse } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { interval, map, merge, Observable } from "rxjs";
import { StreamService } from "../stream/stream.service";
import { ArchiveService } from "./archive.service";

const int = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const validDate = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? v : undefined);

@Controller()
export class ArchiveController {
  constructor(private readonly archive: ArchiveService, private readonly stream: StreamService) {}

  @Get("world/state") world() { return this.archive.worldState(); }

  @Get("events")
  events(@Query() q: Record<string, string>) {
    return this.archive.listEvents({ category: q.category, type: q.type, q: q.q, cursor: q.cursor, limit: int(q.limit), minSignificance: int(q.minSignificance), before: validDate(q.before), after: validDate(q.after), direction: q.direction === "asc" ? "asc" : "desc" });
  }
  @Get("events/:id") event(@Param("id") id: string) { return this.archive.getEvent(id); }

  @Get("blocks") blocks(@Query("before") before?: string, @Query("limit") limit?: string) {
    return this.archive.listBlocks({ before: before && /^\d+$/.test(before) ? before : undefined, limit: int(limit) });
  }
  @Get("blocks/:height") block(@Param("height") h: string) { return this.archive.getBlock(h); }
  @Get("settlements") settlements(@Query("limit") limit?: string) { return this.archive.listSettlements(int(limit)); }
  @Get("wheel") wheel() { return this.archive.wheel(); }
  @Get("evolution") evolution() { return this.archive.evolution(); }
  @Get("milestones") milestones() { return this.archive.milestones(); }
  @Get("origin") origin() { return this.archive.origin(); }
  @Get("future") future() { return this.archive.future(); }
  @Get("search") search(@Query("q") q = "") { return this.archive.search(q); }
  @Get("healthz") health() { return { ok: true }; }

  @SkipThrottle()
  @Sse("stream")
  sse(): Observable<MessageEvent> {
    const updates = this.stream.updates.pipe(map((u) => ({ type: u.kind, data: JSON.stringify(u.data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) })));
    const keepAlive = interval(25_000).pipe(map(() => ({ type: "ping", data: "{}" })));
    return merge(updates, keepAlive) as Observable<MessageEvent>;
  }
}
