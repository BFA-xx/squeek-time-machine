# Deployment

The web app suits Vercel. The API needs a long-running host, because it runs ingestion loops and holds SSE connections open. Serverless functions won't work for it.

## Environment variables

### API (`apps/api`)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/squeek_time_machine` | PostgreSQL connection |
| `PORT` | No | `4300` | Listening port |
| `HOST` | No | `127.0.0.1` | Listening address. Keep it local behind a proxy |
| `PROXY_SECRET` | Yes in production | 32+ random characters | Same value as the web app. Lets it pass on visitors' addresses for rate limiting |
| `ADMIN_TOKEN` | Yes in production | 32+ random characters | Protects the moderation routes |
| `WEB_ORIGINS` | Yes | `https://time.example.com` | Comma-separated origins allowed to send writes |
| `WALLET_DOMAIN` | Yes | `time.example.com` | Domain shown in wallet sign-in messages |
| `SQUEEK_API_BASE` | No | `https://api.squeekchain.com` | Official API address |
| `SEPOLIA_RPC_URLS` | No | Comma-separated URLs | Read-only RPCs, tried in order. The defaults are public endpoints |
| `INGESTION_ENABLED` | No | `true` | Set `false` to serve without ingesting |
| `THROTTLE_PER_MINUTE` | No | `240` | Requests per IP per minute |
| `AUTH_THROTTLE_PER_MINUTE` | No | `10` | Sign-in attempts per IP per minute |
| `NODE_ENV` | Yes | `production` | Turns on secure cookies |

### Web (`apps/web`)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `API_INTERNAL_URL` | Yes | `https://api.time.example.com` | Where Next.js reaches the API |
| `NEXT_PUBLIC_SITE_URL` | Yes | `https://time.example.com` | Absolute URLs for share images. Set before building |
| `PROXY_SECRET` | Yes | Same as the API | Passes visitors' addresses to the API |

No private keys are needed. The app never signs a transaction. In production the API refuses to start if a required setting is missing or too short, and it names which one.

Generate each secret with:

```bash
openssl rand -hex 32
```

## Option A: everything on one server

The simplest setup, and it gives the steadiest live updates. From the repo root:

```bash
npm ci
npm run build
npm run db:migrate
pm2 start deploy/ecosystem.config.cjs
```

Then point your reverse proxy at the web app on port 3300. [`deploy/Caddyfile.example`](../deploy/Caddyfile.example) has a working Caddy block. On nginx, turn off buffering so live updates get through:

```nginx
location / {
  proxy_pass http://127.0.0.1:3300;
  proxy_buffering off;
  proxy_read_timeout 1h;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header Host $host;
}
```

Run one API instance only. Both processes are capped at about 320 MB each in the pm2 file.

## Option B: web on Vercel, API on a server

Run only `stm-api` on the server, expose it through your proxy, and set `API_INTERNAL_URL` to that public address.

- Root directory: `apps/web`. [`apps/web/vercel.json`](../apps/web/vercel.json) sets the install and build commands.
- Set the three web variables in the Vercel project.

Vercel's rewrites can cut long-lived streams. If live updates drop every few minutes, the page reconnects by itself and also refreshes world state every 60 seconds.

## When Squeekchain ships a new release

On-chain actions only target the addresses pinned in `packages/shared/src/chain.ts`, copied from the published [deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json). If the live release changes, those actions stop by themselves, and the site says so. To turn them back on, update the addresses and `PINNED_RELEASE`, check them against the record, and redeploy.

## After deploying

```bash
scripts/smoke.sh https://time.example.com
```

It checks the pages, API, preview images, live stream and locked routes from outside. Then open `/api/v1/world/state`, and check that `sources` shows `ok` for most feeds and that `counts.blocks` has filled in. The official API is in active development and its feeds do go down, so one `unavailable` source is normal. `schema_mismatch` is the one to act on: the official format changed, so update `packages/shared/src/schemas.ts`.

Back up the database. The API only serves the current installation, so this archive may hold the only copy of history from older releases.

## Multiplayer

Multiplayer is optional. Leave `REALTIME_URL` empty and the game stays single-player.

The room runs on a Cloudflare Worker with one Durable Object, using `apps/realtime/src/worker.ts`. It needs a Cloudflare account, and the Workers Free plan has been the target. Check Cloudflare's current limits before relying on them. Over a limit the room stops answering until the daily reset, and the game carries on single-player.

```bash
cd apps/realtime
# Set ALLOWED_ORIGINS in wrangler.toml to your site first.
npx wrangler login
npx wrangler secret put REALTIME_SECRET
npx wrangler deploy
```

Then give the API the same secret and the room's address:

```bash
REALTIME_URL=wss://squeek-time-machine-realtime.YOURNAME.workers.dev
REALTIME_SECRET=the-same-long-random-string
```

To host it yourself, `apps/realtime/src/node.ts` runs the same room on Node: `npm run build -w apps/realtime`, then `npm start -w apps/realtime`, behind a proxy that terminates TLS.

Positions aren't saved. A browser sends one only when it changes, at most four times a second, and disconnects after a minute in a background tab.

