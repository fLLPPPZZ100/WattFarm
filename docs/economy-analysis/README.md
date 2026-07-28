# WattFarm Economy Assessment

> Final analysis — 2026-07-27
> Based on: income-sources.md, spending-sinks.md, progression-model.md

> **Status: historical snapshot.** This describes the economy as it stood on
> 2026-07-27 and has not been rewritten since. Several findings below have been
> addressed, so read it as the reasoning that motivated those changes rather
> than as a description of the current build:
>
> - **P0, exponential pricing** — the geometric formula, including the series
>   total for multi-unit buys, is implemented in `routes/assets.js`. It is inert
>   only because every seeded `multiplier` is 1; the fix is now a seed value, not
>   missing code.
> - **P1, cold start** — new accounts receive a starting VLT grant on
>   provisioning (`routes/auth.js`).
> - **Minigame yield** — the loot table was tripled to an EV of 0.55 VLT per
>   play (96.95% miss, 10/50/100 VLT). The figures quoted below (0.175 EV,
>   98.65% miss) are the old table.
> - **Endgame sink** — grid expansion exists: one row at a time to 8, at
>   `50000 × 4^(rows - 4)` VLT, and it is purchasable from the Shop.
>
> Still open: wind and hydro remain dormant, so 100 of the 150 VLT per cycle are
> never distributed. See `DECISIONS.md` for what the build does today.

---

## 1. Executive Summary

WattFarm's economy is built on a sound mathematical foundation — the `rate / (rate + baseline) × budget` mining formula provides elegant diminishing returns and a clear progression incentive — but it is fatally undermined by a single implementation gap: the exponential pricing described in DECISIONS.md was never wired into the buy route. Every solar panel costs a flat 10 VLT regardless of how many the player owns. Combined with 24/7 passive mining, this means a player fills the entire 56-cell grid in roughly 4 days and then has nothing left to spend VLT on — ever.

The cold start is equally broken in the other direction. A new player has 0 VLT, 0 panels, and therefore 0 mining income. The only bootstrap path is minigames, which yield an expected 7.9 VLT/day at moderate play (and a median outcome close to 0 due to the 98.65% miss rate). That means 3+ days of clicking slot machines before the core loop even starts. Most players will abandon during this window.

In short: the first three days feel pointless, the next day is a rush to completion, and day five onward is a dead economy. The bones are good — the payout formula, the diminishing-returns curve, the mount trade-off — but without cost escalation, a starter grant, and endgame sinks, there is no functioning idle-game loop.

---

## 2. Critical Issues (Prioritised)

### P0 — Exponential pricing not implemented

**What:** DECISIONS.md specifies `currentPrice = basePrice × multiplier ^ quantityAlreadyBought`. The `multiplier` field (1.15 for solar) exists in the database, is returned by `GET /catalog`, but is never applied in `POST /buy`. Every panel costs 10 VLT forever.

**Impact:** Total grid cost is 1,400 VLT (flat) vs ~168,000 VLT (exponential). With flat pricing, full grid is reachable in ~19 hours of passive mining after the first panel. The intended multi-week progression collapses to a single play session.

---

### P1 — Cold start: 3+ days of minigames before the loop starts

**What:** New accounts begin with 0 VLT and no panels. Mining income requires at least one panel on a mount (25 VLT minimum). The only income source is minigames at 0.175 VLT expected per play. At moderate play (45 plays/day across 3 games), EV is 7.875 VLT/day. Median daily payout is often 0-5 VLT due to 98.65% miss rate.

**Impact:** The most critical moment of any idle game — the first ten minutes — delivers nothing. Player retention will crater before the core loop activates.

---

### P2 — No endgame sink: VLT accumulates forever after grid completion

**What:** Once all 56 cells are filled, VLT has zero utility. Income continues at ~4,590 VLT/day (full double-mount grid). No prestige system, no grid expansion, no panel upgrades, no cosmetics shop, no consumables.

**Impact:** The earn→spend→grow loop dies. The game becomes a number going up with no meaning, which is not engagement — it is a screensaver.

---

### P3 — No competitive element: VLT minting scales linearly with player count

**What:** Each player's payout is computed independently against the fixed `NETWORK_POWER_BASELINE` (40 W/s). The "50 VLT budget per cycle" is not a real budget — it is a per-player asymptote. With 1,000 full-grid players, the system mints ~31,818 VLT/cycle (636× the nominal budget).

**Impact:** Harmless while VLT is a private score. Becomes hyperinflationary the moment any shared resource (marketplace, leaderboard, limited items) is introduced.

---

### P4 — Wind and hydro networks are dormant (2/3 of budget system unused)

**What:** The mining cron allocates 50 VLT/cycle for each of solar, wind, and hydro — but no placeable wind or hydro assets exist in the catalog seed. Players can only mine solar. Allocation sliders are parked/unmounted.

**Impact:** The 100 VLT/cycle allocated to wind and hydro is orphaned budget. The architecture supports multi-network play but the economy only operates on one-third capacity.

---

### P5 — Minigames are economically irrelevant once mining starts

**What:** At 5 panels (easily reachable on day 1 post-bootstrap), mining pays 800 VLT/day passively. Hardcore minigaming (7.8 hours of active play) adds 15.75 VLT — that is 2 VLT/hour of effort versus 33 VLT/hour of doing nothing. Minigame income is <1% of total for any player past early game.

**Impact:** Rational players stop playing minigames immediately. The mechanic exists but lacks economic justification. It may still serve as entertainment, but the reward signal is too weak to motivate repeated play.

---

### P6 — Time-per-purchase decreases instead of increasing (inverted pacing)

**What:** With flat costs and growing income, each successive panel is faster to buy than the last. Panel 2 takes 3.4 hours, panel 10 takes 27 minutes, panel 40 takes 10 minutes. The idle-game standard is the opposite: growing anticipation with each milestone.

**Impact:** No natural deceleration. Late game feels like checkbox filling rather than achievement. Implementing exponential pricing (P0) fixes this automatically.

---

## 3. Recommendations

### R1 — Implement exponential pricing (fixes P0 and P6)

**What to change:** In `POST /buy` and `GET /catalog`, apply the formula `currentPrice = basePrice × multiplier ^ quantityAlreadyBought`. The `multiplier` field already exists in `AssetCatalog` (1.15 for solar panels).

**Why:** This is documented design intent that was never coded. With 1.15× scaling, panel 1 costs 10 VLT, panel 10 costs 35 VLT, panel 30 costs 662 VLT, panel 56 costs ~21,172 VLT. Total grid cost rises from 1,400 to ~168,000 VLT. Time-to-full-grid extends from ~4 days to several weeks, creating the sustained progression loop that idle games require.

**Expected impact on progression:**
- Time to 10 panels: ~2 days (vs current ~hours)
- Time to 30 panels: ~1-2 weeks
- Time to 56 panels: ~4-6 weeks
- Each purchase takes longer than the last (correct pacing)

**Complexity:** Low. The multiplier is stored; the formula is documented. Two lines of arithmetic in the buy route + one in the catalog route.

---

### R2 — Add a starting grant (fixes P1)

**What to change:** On account creation (or first login), credit the player with 50 VLT — enough to buy 1 single mount (15 VLT) + 1 panel (10 VLT) with 25 VLT left over toward the next purchase.

**Why:** The 50 VLT grant lets the player place a panel within the first minute of play. Mining begins immediately (7.32 VLT/hour at 1 panel). The core loop — see income rise, buy next panel, feel growth — starts in the first session instead of after 3 days of coin-flip minigames.

**Expected impact:** Eliminates the 3-day dead zone. First panel goes up in minute 1. With exponential pricing in place, the grant buys exactly one panel+mount and nothing more, so it does not skip meaningful progression.

**Complexity:** Low. One-time VLT credit on user creation or first sync. Guard against double-granting via a flag or idempotent check.

---

### R3 — Add endgame sinks (fixes P2)

**What to change:** Introduce one or more VLT sinks that remain available after grid completion. Recommended options in order of design coherence:

1. **Grid expansion tokens** — Purchase additional rows at exponentially escalating cost (e.g., row 5 costs 50,000 VLT, row 6 costs 200,000 VLT). Reuses existing placement mechanics.
2. **Panel efficiency upgrades** — Pay to increase a panel's base W/s from 1.0 to 1.1, 1.2, etc., at exponential cost per tier. Deepens existing panels rather than adding new ones.
3. **Prestige/rebirth** — Reset grid + panels for a permanent multiplier on all future earnings. Classic idle-game extension that adds months of replayability.
4. **Cosmetics** — Grid skins, panel themes, avatar unlocks priced in VLT. Low design risk but also low engagement depth.

**Why:** Without a sink, the endgame arrives in days and the economy dies. Any sink with escalating cost creates an infinite (or very long) tail of meaningful spending.

**Expected impact:** Extends meaningful play from ~4 days to weeks/months depending on sink depth. Grid expansion alone (3-4 additional rows at geometric cost) adds 2-3 weeks per row with exponential pricing.

**Complexity:** Medium to High depending on option chosen. Grid expansion is medium (reuses placement logic, needs new catalog entries and UI). Prestige is high (full reset flow, persistent multiplier, UI for rebirth).

---

### R4 — Make mining payout competitive (fixes P3)

**What to change:** Replace the per-player formula with a true budget split:
```
playerShare = (playerRate / totalPlayerRate) × budget
```
where `totalPlayerRate` is the sum of all active miners' rates (or `totalPlayerRate + NETWORK_POWER_BASELINE` to keep the diminishing-returns feel while still capping total output).

**Why:** The current formula mints VLT proportional to player count with no cap. A true shared budget means total VLT output is fixed at 50/cycle regardless of whether 1 or 10,000 players are mining. This is essential if VLT will ever have cross-player meaning.

**Expected impact:** Individual income decreases as the player base grows, creating natural difficulty scaling (like Bitcoin hashrate). Early adopters earn more; latecomers face a harder grind — which is standard for mining-themed games.

**Complexity:** Medium. Requires summing all players' W/s in the cron job (one aggregation query), then dividing the fixed budget proportionally. The `NETWORK_POWER_BASELINE` can remain as a synthetic "NPC miner" to prevent the budget being fully captured when player count is low.

---

### R5 — Activate wind and hydro networks with placeable assets (fixes P4)

**What to change:** Add `wind` and `hydro` entries to the asset catalog seed with appropriate base prices, multipliers, and base W/s values. Create corresponding mount types (wind turbine mounts, hydro plant mounts) or allow these assets on existing mount bays.

**Why:** DECISIONS.md already defines wind turbines (25 VLT base, 1.18× multiplier, 3 W/s) and hydro plants (60 VLT base, 1.22× multiplier, 8 W/s). The mining cron allocates budget for all three networks. Activating them triples the available budget surface and creates strategic allocation decisions.

**Expected impact:** Players choose between specialising in one network (higher share of one budget) or diversifying (moderate share of three budgets). Splitting across networks is mathematically superior (~64% more income when all three are active and evenly allocated), creating a meaningful strategic choice.

**Complexity:** High. Requires new asset types, new mount types (or multi-purpose mounts), separate grid sections or a unified grid with type constraints, and UI for allocation. This is a full feature, not a tuning change.

---

### R6 — Scale NETWORK_POWER_BASELINE dynamically (alternative/complement to R4)

**What to change:** Instead of a fixed 40 W/s baseline, compute it as:
```
effectiveBaseline = BASE_MINIMUM + (totalActivePlayerPower × SCALE_FACTOR)
```

For example: `effectiveBaseline = 20 + (totalPlayerW × 0.5)`

**Why:** This creates automatic difficulty adjustment. As more players join and build, the effective baseline rises, reducing each individual's share. It preserves the existing per-player formula (no architectural change to the cron job) while adding systemic supply control.

**Expected impact:** With 100 players at 70 W/s each, `totalPlayerW = 7000`, effective baseline = 20 + 3500 = 3520 W/s. Each player's share: `70 / (70 + 3520) × 50 = 0.97 VLT/cycle`. This naturally throttles inflation as the player base grows.

**Complexity:** Low-Medium. One additional query per cron run (sum of all W/s) and a config parameter. No schema changes.

---

### R7 — Boost minigame rewards for early game, introduce daily quests

**What to change:**
- Increase common loot from 5 → 15 VLT and rare from 25 → 50 VLT for the first 7 days of account life (or until 5 panels owned). This makes minigames a meaningful bootstrap path.
- Add a "daily quest" system: complete 5 minigame plays = guaranteed 10 VLT. This removes the pure-RNG frustration of early game while remaining trivial once mining is established.

**Why:** Without a starting grant (or in addition to it), minigames should feel purposeful during the bootstrap phase. The current 0.175 VLT EV/play is psychologically damaging — 98.65% of interactions yield nothing, which trains the player to feel that playing is futile.

**Expected impact:** With boosted early-game rewards (EV ~0.5 VLT/play) + daily quest (10 VLT guaranteed), a new player can bootstrap to their first panel in ~1 day instead of 3+. If combined with R2 (starting grant), this becomes a quality-of-life improvement rather than a necessity.

**Complexity:** Medium. Requires account-age or panel-count gating on the loot table, plus a daily quest tracking system.

---

## 4. Balance Parameters Table

| Parameter | Current Value | Recommended Value | Rationale |
|-----------|--------------|-------------------|-----------|
| `NETWORK_POWER_BASELINE` | 40 W/s | 40 W/s (keep) or dynamic (R6) | 40 produces a 24× income spread from 1 to 56 panels. Healthy for single-player. Switch to dynamic only if multi-player economy is planned. |
| Budget per network per cycle | 50 VLT / 10 min | 50 VLT (keep) | With exponential pricing, 50 VLT/cycle creates a multi-week progression to full grid. Adequate. |
| Panel base price | 10 VLT | 10 VLT (keep) | The base is fine — it is the multiplier application that is missing. 10 VLT for panel #1 is reachable in the first session with a 50 VLT starting grant. |
| Single mount price | 15 VLT (flat) | 15 VLT (keep flat) | Mounts are infrastructure, not the scaling cost driver. Flat mount pricing keeps the exponential curve focused on panels. |
| Double mount price | 45 VLT (flat) | 45 VLT (keep flat) | At 22.50/bay vs single's 15.00/bay, the double costs 50% more per bay but gives +25% power. Net cost-per-watt is 26 vs 25 — the trade-off is real but narrow. Consider widening to 50-55 VLT if doubles dominate too strongly. |
| Panel multiplier (exponential) | 1.15 (stored, **NOT applied**) | 1.15 (**must implement**) | At 1.15×, panel 56 costs ~21,172 VLT. Total grid cost ~167,247 VLT. With full-grid income of ~191 VLT/hour, last panel takes ~111 hours. This creates a 4-6 week progression arc — appropriate for an idle game. If this feels too slow, 1.12 compresses to ~2-3 weeks; 1.18 stretches to ~8-10 weeks. |
| Minigame loot: common | 1.00% → 5 VLT | 1.50% → 10 VLT | Doubles EV from 0.175 to ~0.45 VLT/play. Still negligible vs mid/late mining but feels less futile during bootstrap. |
| Minigame loot: rare | 0.30% → 25 VLT | 0.30% → 50 VLT | Meaningful early-game jackpot (covers 2 panels). Negligible at scale. |
| Minigame loot: epic | 0.05% → 100 VLT | 0.05% → 100 VLT (keep) | Already a jackpot. Raising this devalues the rarity feeling. |
| Starting grant | 0 VLT | **50 VLT** | Covers exactly 1 panel (10) + 1 single mount (15) with 25 VLT toward the next purchase. Gets the mining loop running in minute 1. With exponential pricing, 50 VLT is trivial relative to total grid cost (~168k VLT) and cannot be exploited via multi-accounting meaningfully. |
| Grid expansion cost (new) | N/A | Row 5: 50,000 VLT; Row 6: 200,000 VLT; Row 7: 800,000 VLT | Geometric scaling (4× per row). At full-grid income of ~4,590 VLT/day, row 5 takes ~11 days. Row 6 takes ~44 days. Creates months of endgame purpose. |
| Prestige multiplier (new) | N/A | +25% income per prestige level, cost: full grid reset | Each prestige makes the next run ~20% faster (diminishing relative benefit). 4 prestiges before ceiling (~2× base speed). Prevents trivialisation of future content. |

---

## 5. Priority Implementation Order

| Priority | Action | Fixes Issues | Effort | Impact |
|----------|--------|--------------|--------|--------|
| 1 | Implement exponential pricing in buy route | P0, P6 | Low | Transforms 4-day game into 4-6 week progression |
| 2 | Add 50 VLT starting grant | P1 | Low | Eliminates 3-day dead start; immediate engagement |
| 3 | Add grid expansion as endgame sink | P2 | Medium | Extends meaningful play by weeks/months |
| 4 | Boost early minigame rewards | P5 (partially) | Low-Medium | Improves first-session feel |
| 5 | Make payout competitive or add dynamic baseline | P3 | Medium | Required before any shared economy feature |
| 6 | Activate wind/hydro networks | P4 | High | Triples content surface area |

---

## 6. Risk: Large Number Overflow

With exponential pricing at 1.15× per panel:
- Panel 56 costs ~21,172 VLT — safe.
- Cumulative 56 panels: ~167,247 VLT — safe.

With grid expansion (additional rows at 4× geometric cost):
- Row 5 (14 more cells, 70 total panels): panel 70 at 1.15^69 = ~172,000 VLT per panel. Cumulative ~1.3M VLT. Safe.
- Row 8 (112 total panels): panel 112 at 1.15^111 = ~8.4 billion VLT per panel. **Exceeds safe integer (2^53 ≈ 9×10^15) at around panel 250.**

**Verdict:** With the current grid (56 cells) and up to ~3 expansion rows, all numbers stay well within JavaScript's safe integer range. If expansion goes beyond 7 rows or prestige multipliers stack on top, a big-number library will be needed. Flag this to the logic specialist if expansion exceeds 100 total panels.

---

## 7. Validation: Before/After Simulation

### Current state (flat pricing, no grant)

```
Day 1-3:  Minigame grind. ~0-10 VLT accumulated. No panels. No loop.
Day 4:    First panel bought. Mining starts. 25 VLT → full grid in <24h.
Day 5+:   Grid full. 4,590 VLT/day income. Nothing to spend on. Dead economy.
```

### After recommendations (exponential pricing + 50 VLT grant + grid expansion)

```
Minute 1:  50 VLT grant → buy mount + panel. Mining loop starts.
Day 1:     ~5 panels. Income: 33 VLT/h. Next panel costs ~20 VLT. Buying every 36 min.
Day 3:     ~12 panels. Income: 68 VLT/h. Next panel costs ~54 VLT. Buying every 48 min.
Week 1:    ~18 panels. Income: 93 VLT/h. Next panel costs ~123 VLT. Buying every 80 min.
Week 2:    ~24 panels. Income: 112 VLT/h. Next panel costs ~282 VLT. Buying every 2.5h.
Week 4:    ~32 panels. Income: 128 VLT/h. Next panel costs ~938 VLT. Buying every 7.3h.
Week 6:    ~40 panels. Income: 142 VLT/h. Next panel costs ~2,679 VLT. Buying every 19h.
Week 8-12: Panels 40-56. Costs 2,679-21,172 VLT each. Days between purchases.
Week 12+:  Grid full. Start saving for row 5 expansion (50,000 VLT = ~11 days).
Month 3+:  Row 6 expansion (200,000 VLT = ~44 days). Prestige decisions.
```

This is the pacing profile of a healthy idle game: fast early feedback, steady mid-game engagement, anticipation-building late game, and a prestige/expansion loop that extends indefinitely.

---

## 8. Final Verdict

WattFarm's economy has the right *shape* — diminishing-returns mining, a grid-filling goal, tiered asset choices — but the numbers are disconnected from the design. The exponential pricing exists in documentation and database but not in code. The starting grant does not exist. The endgame is a void.

**The single highest-impact change is two lines of arithmetic in the buy route.** Implementing `price = basePrice × multiplier ^ owned` transforms a 4-day disposable game into a multi-week progression with natural pacing. Combined with a trivial 50 VLT starter grant, the first-time experience goes from "three days of nothing" to "immediate growth from minute one."

Everything else — endgame sinks, competitive payouts, wind/hydro activation — is important but secondary. Fix the pricing. Add the grant. Then build the endgame.
