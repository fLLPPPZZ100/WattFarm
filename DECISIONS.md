# Design Decisions — WattFarm

## Routes
| Route | Page | Notes |
|---|---|---|
| `/` | Dashboard | Overview: W counter, VLT balance, total assets, quick links |
| `/my-assets` | My Assets | Farm view with pixel art sprites, buy catalog, W accumulation |
| `/minigames` | Minigames | 3 game cards: Solar Swipe, Wind Clicker, Hydro Race |
| `/wallet` | Wallet | Mining payout history + minigame activity summary |
| `/profile` | Profile | User info + mining allocation sliders |
| `/style-guide` | (removed in Phase 6) | Disposable test page for design tokens |

## Game IDs (minigames)
- `solar-swipe` — Solar Swipe
- `wind-clicker` — Wind Clicker
- `hydro-race` — Hydro Race

## Asset types (matching AssetCatalog)
- `solar` — Solar Panel (10 VLT base, 1.15× multiplier, 1 W/s)
- `wind` — Wind Turbine (25 VLT base, 1.18× multiplier, 3 W/s)
- `hydro` — Hydro Plant (60 VLT base, 1.22× multiplier, 8 W/s)

## Price formula
`currentPrice = basePrice × multiplier ^ quantityAlreadyBought`
(calculated server-side on every request, never stored)

## W calculation
`accumulatedW = baseW × quantity × elapsedSecondsSince(lastCollected)`
(computed on-the-fly via `wCalculator.js`, never stored in DB)

## Cooldown tiers (minigames)
| Plays today | Tier | Cooldown |
|---|---|---|
| 0–4 | 0 | 10 seconds |
| 5–9 | 1 | 60 seconds |
| 10–19 | 2 | 5 minutes |
| 20+ | 3 | 10 minutes |

## Loot table
| Result | Probability | VLT |
|---|---|---|
| none | 98.65% | 0 |
| common | 1.00% | 5 |
| rare | 0.30% | 25 |
| epic | 0.05% | 100 |

## Mining allocations
`POST /api/mining/allocations` counts as an economy route, not a preferences
route. It sets how much of a player's power each network receives, so it decides
income just as directly as a purchase does — it therefore requires a verified
email and runs under the same `withUserLock` row lock as purchases, minigame
plays and layout writes. It was the only mutating economy route without either.

One row per `(userId, network)` is enforced by a unique constraint, so the write
is an upsert rather than a delete-then-create of every row. A network the player
zeroes out is absent from the payload and gets deleted, inside the same
transaction.

Validation lives in `services/allocationRules.js`, free of Prisma and Express
imports so `npm run test:allocations` can exercise it without a database.

## Mining payout
- Cron runs every 10 minutes
- Fictitious budget: 50 VLT per network (solar/wind/hydro)
- Distributed proportionally based on: player's effective W × allocation %
- W is calculated via the same `wCalculator.js` used for display

## Database migrations
`prisma db push` is not used on anything that will be deployed. It was, and the
migration history silently fell behind `schema.prisma`: `PlacedMount` and
`LedgerEntry` existed only in the schema, the money columns were still
`DOUBLE PRECISION`, `User.email` was still NOT NULL, and two declared indexes
were never created. So any database built from migrations was missing the whole
placement feature, and `lib/money.js` was doing exact arithmetic and then
handing the result to a float column. Local development looked fine throughout,
because it ran against a `db push` database.

Rules:
- Schema changes go through `npm run prisma:migrate` (`migrate dev`), which
  writes a migration file. Deployments use `npm run prisma:deploy`.
- `npm run prisma:drift` replays the full migration history into a shadow
  database and diffs it against `schema.prisma`. It exits non-zero when they
  disagree, so it belongs in CI. Requires `SHADOW_DATABASE_URL`.
- Money columns are `Decimal(18,4)`. Ratios and physical rates
  (`multiplier`, `baseW`, `percentage`) stay `Float` on purpose — they carry no
  exactness guarantee.

## Auth flow
- Firebase Auth handles identity (email/password + Google)
- `POST /api/auth/sync` upserts user into Postgres on every auth state change
- All protected routes use `verifyAuth` middleware (checks Firebase ID token)
- User PK = Firebase UID (String)

## Environment variables
- `apps/web/.env`: `VITE_FIREBASE_*` (client config) + `VITE_API_URL`
- `apps/api/.env`: `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`

## Fonts
- Display (pixel): Silkscreen — section titles, W, VLT
- Body: Inter — forms, menus, paragraphs
- Mono tabular: JetBrains Mono — live counters to prevent digit-width layout shift