# Squeek Time Machine

A living 3D archive of Squeekchain. Visitors walk a hamster through an underground burrow where every pillar, block and door is backed by a real record, and the world grows by itself as new blocks settle.

**Community-built. Not made or endorsed by the Squeekchain team.** Squeekchain runs on the Sepolia testnet, where SQK and Squeeks have no monetary value.

## What's in it

- **The burrow:** a walkable hub with a giant WHEELY9000 that turns only when the real wheel is measured turning.
- **Seven rooms:** The Beginning, The Timeline, The Wheel Room, The Block Vault, The Evolution Room, The Community Archive and The Future.
- **Living world engine:** pulls from the official API and the contract's logs, removes duplicates, resumes after interruptions and keeps the last good copy during outages.
- **I WAS HERE:** visitors attach memories to specific records, kept apart from the official data.
- **Sharing:** every event and block has its own page and preview image.
- **2D archive:** the full product at `/archive`, for weak devices and screen readers.

## Run it locally

Needs Node 20+ and PostgreSQL 14+.

```bash
npm install
createdb squeek_time_machine
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env` with your database URL and an admin token, then:

```bash
npm run build -w packages/shared
npm run db:migrate
npm run dev:api
```

And in a second terminal:

```bash
npm run dev:web
```

Open http://localhost:3300. Ingestion starts on its own. Block history takes about a minute to backfill.

## Tests

```bash
createdb squeek_time_machine_test
npm test
```

Set `TEST_DATABASE_URL` if your test database isn't at the default address. The API tests empty every table, and they refuse a database without "test" in its name. They use a scripted stand-in for the official API, so outages and schema changes can be tested on demand.

Browser journeys need the API and web app running, and Google Chrome installed. They create accounts named `e2e_*` in whichever database that API uses.

```bash
npm run test:e2e -w apps/web
```

## Layout

| Path | What it holds |
|---|---|
| `packages/shared` | API validators, event descriptions, milestone rules, text checks, formatting |
| `apps/api` | NestJS API, Prisma schema, ingestion, community and moderation |
| `apps/web` | Next.js app, 3D world, panels and share pages |
| `docs/ARCHITECTURE.md` | How the pieces fit together, and the data rules |
| `docs/DEPLOYMENT.md` | Going to production |
| `deploy/` | pm2 and Caddy examples |
| `scripts/smoke.sh` | Checks a running deployment from outside |
