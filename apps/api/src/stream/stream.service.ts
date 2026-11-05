import { Global, Injectable, Module } from "@nestjs/common";
import { Subject } from "rxjs";

export interface WorldUpdate {
  kind: "live" | "event" | "block" | "settlement" | "milestone" | "mining" | "wheel" | "community" | "source" | "dig";
  data: unknown;
}

/** In-process bus between ingestion and the SSE stream. The browser only ever hears from this server, not the API. */
@Injectable()
export class StreamService {
  readonly updates = new Subject<WorldUpdate>();
  publish(kind: WorldUpdate["kind"], data: unknown) {
    this.updates.next({ kind, data });
  }
}

@Global()
@Module({ providers: [StreamService], exports: [StreamService] })
export class StreamModule {}
