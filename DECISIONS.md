# Design Decisions — WattFarm

## Language
English only, everywhere — copy, code, commits, docs. See
`.kiro/steering/language.md` for the full rule and the reasoning.

## Routes
| Route | Page | Notes |
|---|---|---|
| `/` | Farm | The game. Phaser canvas plus the power and payout panels |
| `/shop` | Shop | Buy catalogue (`pages/MyAssets.jsx`) |
| `/minigames` | Minigames | 3 game cards: Solar Swipe, Wind Clicker, Hydro Race |
| `/wallet` | Wallet | Mining payout history + minigame activity summary |
| `/profile` | Profile | Account details, nickname, password, avatar picker |
| `/storage` | Storage | Owned items not currently placed |
| `/style-guide` | (removed in Phase 6) | Disposable test page for design tokens |

Signing in always lands on `/`. The login page used to honour a `state.from`
location so a deep link resumed after authenticating, but a session should start
at the game rather than dropping the player into `/wallet` because that was the
URL they happened to open.

`/` was called Dashboard. Nothing about it is a dashboard — it is the farm — and
the component (`pages/Farm.jsx`) renders nothing, because the Phaser canvas is
mounted once by `AppShell` in `#phaser-root` and kept alive across navigation.

The mining allocation sliders were removed from `/profile`. The component is
preserved, unmounted, in `components/profile/MiningAllocationPanel.jsx`; the API
routes are untouched. See that file for why it is parked and what the options
are.

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

## Profile identity
- The nickname is Firebase's `displayName`, not a column of ours. Registration
  already wrote it and the header already read it, so there is nothing to mirror
  into Postgres and nothing that can drift out of sync.
- Password changes always re-authenticate first. Firebase would demand it anyway
  once the session is a few minutes old, and requiring the current password
  means an unattended logged-in browser cannot be used to lock the owner out.
- The password form is hidden for accounts without a `password` provider. Google
  accounts have no password to change and `updatePassword` fails on them.
- Account age gets coarser as it grows: minutes, then hours, then
  `dias, horas`, then whole months, then whole years. Past a month the smaller
  units are noise. See `lib/accountAge.js` — the arithmetic walks anniversaries
  rather than dividing elapsed milliseconds by 30 days, which drifts around
  month ends and leap years.

## Mining payout
- Cron runs every 10 minutes
- Fictitious budget: 50 VLT per network (solar/wind/hydro)
- Distributed proportionally based on: player's effective W × allocation %
- W is calculated via the same `wCalculator.js` used for display

## Referrals
- Invite links are `/login?r=CODE`. Codes are 8 characters from a 31-symbol
  alphabet with the ambiguous glyphs (`0/O`, `1/I/L`) removed, drawn from
  `crypto.randomInt` so they are neither guessable nor derived from the account.
  Validation accepts `/^[A-Z0-9]{6,12}$/` — wider than the generator — because
  the migration backfilled existing accounts with uppercase hex.
- **Attribution happens only at account creation.** The code is passed in the
  `create` branch of the `upsert` in `POST /api/auth/sync`; the `update` branch
  never touches `referredById`. So a code sent by a returning player, or replayed
  by someone else, is ignored. A referral cannot be added, changed or stolen once
  the row exists.
- An unknown or malformed code is ignored and registration proceeds. Failing the
  signup would let a stale link lock someone out of creating an account.
- Commissions are settled by a daily batch at 00:15 UTC for the previous UTC day,
  not inline per event. Inline crediting would take a lock on a *second* user's
  row inside the buy route, and two players who referred each other would
  deadlock. The batch also gives a natural retry unit.
- Idempotency is a database constraint, not application bookkeeping: `@@unique`
  on `(referrerId, referredId, kind, periodDate)`. The runner inserts
  optimistically and treats `P2002` as "already settled", so re-running after a
  crash pays nothing twice. `scripts/run-referral-commissions.mjs --twice`
  asserts this.
- Commissions are newly minted VLT; the referred player is never debited.
- There is deliberately **no endpoint that validates a code before signup** and
  none that lists invitees by name or email. A validation endpoint is an
  enumeration oracle, and the stats page identifies invitees by an opaque
  6-character label because a referrer needs to trust the numbers, not to learn
  who clicked the link.
- Known residual risk: one person can run two accounts and refer themselves
  through the second one, which is inherent to referral schemes. The mitigation
  in place is `REQUIRE_VERIFIED_EMAIL`, which forces a distinct deliverable
  address per account. A qualification threshold (say, no commission until the
  invitee has placed N panels) is the next lever if it is abused.
- `REFERRAL_PURCHASE_RATE` is worth a second look before trusting the default.
  In RollerCoin the equivalent 15% is paid on real-money purchases, so it costs
  the operator revenue and takes nothing out of the game economy. Here, purchases
  are the main VLT sink, so a commission on them mints currency *and* weakens the
  sink. Set it to 0 to keep commissions purely income-based.

## Auth flow
- Firebase Auth handles identity (email/password + Google)
- `POST /api/auth/sync` upserts user into Postgres on every auth state change
- All protected routes use `verifyAuth` middleware (checks Firebase ID token)
- User PK = Firebase UID (String)

## Environment variables
- `apps/web/.env`: `VITE_FIREBASE_*` (client config) + `VITE_API_URL`
- `apps/api/.env`: `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`

## Fonts
All three are pixel typefaces. The interface is 2D throughout — 8-bit panels,
hard shadows, no border radius, a CRT scanline overlay — and Inter sitting in the
middle of that was the one element that read as a different product.

- Display: **Silkscreen** — section titles, buttons, W and VLT labels. A true
  bitmap face, so it is the only one with font smoothing switched off.
- Body: **Pixelify Sans** — forms, menus, paragraphs. Chosen over the other pixel
  faces because it stays legible at paragraph length and has a real weight axis
  (400..700), which Silkscreen and VT323 do not.
- Mono: **VT323** — live counters, balances, inputs. Genuinely monospaced, which
  is the entire reason this slot exists: a proportional font makes a ticking
  counter jump as digit widths change. It replaced JetBrains Mono, which held the
  same job but was not a pixel face.

Smoothing is left on for body and mono on purpose. Pixelify Sans and VT323 are
outline fonts drawn to *look* pixelated rather than true bitmaps, so disabling
smoothing makes them ragged at any size that is not a whole multiple of their
internal grid.