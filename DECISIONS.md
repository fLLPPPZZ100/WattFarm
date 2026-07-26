# Design Decisions — WattFarm

## Routes
| Route | Page | Notes |
|---|---|---|
| `/` | Dashboard | Phaser farm grid, power rate, network share, next payout |
| `/shop` | Shop | Buy catalog (panels and mounts), prices from `/api/assets/catalog` |
| `/minigames` | Minigames | Solar Swipe (wind and hydro games were removed) |
| `/wallet` | Wallet | Mining payout history + minigame activity summary |
| `/referral` | Referral | Invite link, tier progress, referral list and commission totals |
| `/profile` | Profile | User info and avatar (allocation sliders were removed) |
| `/storage` | Storage | Owned but unplaced inventory |
| `/login` | Login | Public; pixel-art sign-in and registration |

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

## Mining payout
- Cron runs every 10 minutes
- Fictitious budget: 50 VLT per cycle (solar only — wind and hydro were removed)
- Split by share of the network: `rate / (baseline + every player's rate)`
  - One shared denominator for everyone. Computing each player against the
    baseline independently minted currency as the player base grew.
- Based on the **instantaneous power rate** of what is actually placed on the
  grid, not on accumulated watts and not on owned quantity (`wCalculator.js` is
  gone; see `services/powerCalculator.js`)
- Referral commission is issued **on top of** the budget — see below

## Referral programme
Modelled on RollerCoin's: the referrer earns a percentage of what their
referrals *earn*, rather than a bounty per signup.

- Invite code: 8 characters of Crockford base32 (no I/L/O/U), from
  `crypto.randomInt`, issued lazily on first sync
- Attribution happens **only** when the account row is created, inside
  `POST /api/auth/sync`, from a `referralCode` in the request body
  - `referredById` is immutable afterwards. There is deliberately no endpoint
    that sets it — a reassignable referrer is farmable.
  - Because it can only be written at creation, a referral cycle is
    structurally impossible and needs no cycle check.
- The client parks an inbound `?ref=CODE` in localStorage and sends it with the
  first sync, so the code survives registration and the Google redirect
- Commission tiers by referrer points: 10% / 13% / 16% / 20% / 25% at
  0 / 3 / 10 / 25 / 60 points
- A referral must reach **10 W/s installed** before their referrer earns
  anything. That is roughly 250 VLT of investment, which can only come from
  actually mining — it is the anti-fraud gate.
- One point per referral that reaches that milestone
- Signup bonus (25 VLT) goes to the **person joining**, never the referrer.
  That asymmetry is what makes self-referral pointless: there are no transfers
  between players, so bonuses farmed onto throwaway accounts are stranded.
- Idempotency is enforced by the database, not application logic:
  `ReferralReward(sourceKind, sourceId)` is unique, so one mining payout can
  only ever produce one commission even if the cycle is re-run
- Commission runs in the **same transaction** as the payout it derives from
- **Commission intentionally breaks budget conservation.** It is newly issued
  VLT beyond the 50/cycle budget, because it must not be deducted from the
  referred player's reward. It is marketing spend, bounded by the number of
  qualified referrals. Do not "fix" it by taking it out of their payout.
- Logic checks: `npm run test:referral --workspace apps/api` (no database needed)

## Auth flow
- Firebase Auth handles identity (email/password + Google)
- `POST /api/auth/sync` mirrors the Firebase account into Postgres and is
  awaited before the session is considered ready
  - Read-then-create rather than `upsert`, because a referral may only be
    applied to a genuinely new row and `upsert` cannot report which it did
  - A concurrent duplicate sync surfaces as a unique violation on `id` and is
    resolved by reading the winner's row
- All protected routes use `verifyAuth` middleware (checks Firebase ID token)
- User PK = Firebase UID (String)

## Environment variables
- `apps/web/.env`: `VITE_FIREBASE_*` (client config) + `VITE_API_URL`
- `apps/api/.env`: `DATABASE_URL`, `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`

## Fonts
- Display (pixel): Silkscreen — section titles, W, VLT
- Body: Inter — forms, menus, paragraphs
- Mono tabular: JetBrains Mono — live counters to prevent digit-width layout shift