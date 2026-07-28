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
- Share is `rate / (rate + NETWORK_POWER_BASELINE) x budget`, where `rate` is the
  instantaneous output of what is **placed**, times the network's allocation
  percentage. Computed by `services/powerCalculator.js`.
- Only solar pays. `NETWORK_SOURCES` in `services/miningPayout.js` marks wind and
  hydro as dormant because neither has a placeable asset yet, so their 50 VLT
  budgets are unclaimed.
- **Every account is created with a 100% solar allocation.** The cron reads
  `MiningAllocation` to decide who to pay and skips players without a row, and
  for a long time nothing created one — the only writer was the allocation slider
  UI, which was unmounted. The result was that no player ever earned anything
  from mining, silently. The allocation is now created in the same statement as
  the account.

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

Two surfaces, two rules.

**The surrounding UI** (menus, cards, forms, notifications, tables) is now set
in a three-role system. An all-pixel interface looked the part but cost reading
speed: long copy in a pixel face and numbers in a proportional one are exactly
where the style stops paying for itself.

- Title — **Pixelify Sans** (`--font-title`). Identity only: the wordmark, page
  and section titles, buttons, the occasional headline value. Kept on the
  `font-display` / `text-heading-*` tokens, so it is deliberate and scarce
  rather than the default. Smoothing stays **on**: it is an outline face drawn
  to look pixelated, not a bitmap, and goes ragged with smoothing off.
- UI — **Inter** (`--font-ui`). The body of the interface and the default for
  anything without an explicit family: prose, labels, inputs, descriptions,
  cards, notifications, modals. This is the change that buys the legibility.
- Mono — **JetBrains Mono** (`--font-mono`). Every number that matters: VLT,
  W/s, timers, ids, counters. Tabular figures, so a ticking value never nudges
  the layout — the reason a mono slot exists at all. It replaces VT323 in the
  UI; VT323 was monospaced but not built for reading long ids.

The three roles are CSS variables in `index.css` (`:root`), and Tailwind's
`font-*` tokens resolve to them, so nothing names a family inline. The reusable
`.text-heading-xl/lg/md`, `.text-body`, `.text-body-sm`, `.text-label`,
`.text-stat`, `.text-currency` and `.text-timer` classes carry the size, weight
and spacing for each level of the hierarchy.

**The Phaser farm canvas** keeps the original pixel faces — **Silkscreen** for
labels, **Pixelify Sans** for prose, **VT323** for numbers — via its own
constants in `apps/web/src/game/ui/pixelUi.js`. That surface is the game world
itself, where the 8-bit character earns its place, and it draws straight to the
canvas without inheriting the CSS. All five families are therefore loaded: three
for the UI, and Silkscreen/VT323 additionally for the canvas.