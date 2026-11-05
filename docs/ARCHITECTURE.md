# Architecture

```
official API ─┐
              ├─> ingestion ─> validation ─> PostgreSQL ─> REST + SSE ─> Next.js rewrite ─> browser
Sepolia logs ─┘                                 ^
                                 community writes (separate tables)
```

The browser only talks to this site. Next.js rewrites `/api/v1/*` to the API, so session cookies stay first-party and the official API isn't called from every visitor's browser.

## Data rules

1. **Unknown isn't zero.** A response with `status: "unavailable"` changes nothing except the source's health. Missing readings are stored as null and drawn as gaps.
2. **Measurements aren't confirmations.** Wheel data comes from the device and is flagged provisional all the way to the UI. Only chain events can read "Confirmed on Ethereum".
3. **Nothing is invented.** A record's time comes from its source. A Squeek block's time is its settlement's Ethereum time. A derived milestone waits until the record that crossed the line is stored. Supply milestones are the one exception: no record gives their exact moment, so they say "first observed by this archive".
4. **Official records are insert-only.** A later change from the source is written to `RecordCorrection`, with the old and new values. The only field updated in place is the confirmation state, and that update is logged too.
5. **Community can't reach official tables.** Community services have no code path that writes to them, and a test asserts it.

## Ingestion

Each source has its own loop and exponential backoff, so one failure can't stop the others.

| Job | Source | Every | Stores |
|---|---|---|---|
| status | `/v1/status` | 5 s | Last good copy, live SSE update |
| events | `/v1/events` | 15 s | `HistoricalEvent`, `Milestone` |
| settlements | `/v1/settlements` | 30 s | `SettlementRecord`, `BlockRecord`, settlement events |
| core | `/v1/core` | 30 s | Installation details |
| economy | `/v1/economy/state` | 60 s | `MiningRecord`, supply milestones |
| stats | `/v1/measurement/stats` | 5 min | `WheelDay`, records |
| runs | `/v1/measurement/runs` | 2 min | Last good copy |
| chain | Sepolia `BatchSettled`, `RoundRecorded` | 60 s | Older settlements, blocks, difficulty history |

- **Deduplication:** events use the source's stable id. Settlements from the contract logs are given the same id format the feed uses, so the timeline stays complete when the feed is down and doesn't double up when it returns.
- **Resuming:** `IngestionCursor` stores the event backfill cursor and the last scanned Ethereum block, per installation.
- **Schema changes:** each endpoint has a list of supported `schemaVersion` values in `packages/shared/src/schemas.ts`. An unknown version stops that source and is reported in `DataSource` and on screen.
- **Resets:** every record belongs to an `Installation`, because each release can restart the counters.

The API should run as one instance. The ingestion loops aren't coordinated across processes. Duplicates are still prevented by database constraints, but the SSE stream only reaches clients of the instance that ingested the update.

## The Great Dig

A free game with no money in it. `packages/shared/src/dig.ts` holds the rules, and `apps/api/src/dig/dig.service.ts` runs them.

- **Shifts:** 36 rounds, or six hours. Players can only call the next shift, and calls lock when it starts, by the server's clock. Picks stay hidden until then.
- **Settling:** a shift settles only when the certified frontier has passed its last round and the contract logs have been read past that settlement. Its work comes from certified totals. Rounds past the frontier are unknown, so they never count as zero.
- **Scoring:** a right call earns 10 points, plus up to 90 more the fewer people got it right. Points can't be bought, sold or spent.
- **Chambers:** every 1,000 settled work breaks through one, timed by the settlement that crossed the line. The crew with the most points since the last breakthrough claims it, and a tie claims nothing.
- **Squeeks:** cosmetic only. Ownership is read from the official API for display, checked when chosen and again hourly. A Squeek never affects points.
- **New releases:** everything is per installation, so a reset starts a new season.
- **Welfare:** the game only observes. Nothing in it can prompt or reward making the hamster run.

## 3D world

- One continuous world: a hub, eight tunnels and eight rooms, laid out in `components/world/layout.ts`, which also holds the collision rules.
- Room contents load when you get close and unload when you leave.
- Block, pillar and lantern rows are instanced, so thousands of records stay cheap.
- There's a fixed number of lights, moved around rather than added, so walking never recompiles shaders.
- There are no downloaded models. All geometry and textures are generated in code, and all sound is synthesised in the browser.
- Quality has `auto`, `low`, `medium` and `high`. `auto` steps down when the frame rate drops. Without WebGL, visitors are sent to the 2D archive.

## Community safety

- Text is plain text everywhere and is never rendered as HTML.
- Links are refused, except to `squeekchain.com` and `etherscan.io`. Common wallet-scam phrases are refused too.
- Limits apply per visitor address and per account. The web app passes the address to the API with a shared secret, because every request reaches the API from the same place. Repeated posts are refused.
- Three independent reports hide a post until a moderator looks at it.
- Moderation runs on `/v1/admin/*` with the `x-admin-token` header. There's no moderation screen yet.
- Wallet sign-in is optional, uses a single-use signed message, and never asks for a transaction.

## Multiplayer

`RoomCore` in `packages/shared/src/realtime.ts` holds the room's rules and knows nothing about its host. `apps/realtime` wraps it twice: `worker.ts` for a Cloudflare Durable Object, and `node.ts` for plain Node, which is also what the tests run against.

The API signs a five-minute ticket with `REALTIME_SECRET` carrying the user's verified name, crew and shown Squeek. The room trusts nothing else about who a player is. In return the room signs receipts for what only it can see, and `DigService.claimTask` verifies them with the same secret. Receipts and tickets can't stand in for each other.

In the browser, `lib/multiplayer.ts` keeps fast-changing state outside React. `OtherPlayers.tsx` draws only the nearest players, and React re-renders only when someone joins or leaves.

