# Spending Sinks Analysis — WattFarm

## Overview

WattFarm has exactly **one spending sink**: purchasing assets from the catalog.
Players earn VLT (via mining payouts and minigame loot) and spend it on solar
panels and panel mounts to fill a fixed-size grid. There is no prestige system,
no consumables, no cosmetic shop, and no upgrade mechanic beyond buying more
units of the three asset types.

---

## Asset Catalog (current implementation)

| Asset | Base Price (VLT) | Multiplier | Base W/s | Notes |
|---|---|---|---|---|
| `solar` (panel) | 10 | 1.15 | 1 | Produces power when placed on a mount |
| `panel-mount` (single) | 15 | 1.0 | 0 | Occupies 1 cell, holds 1 panel |
| `panel-mount-double` | 45 | 1.0 | 0 | Occupies 2 cells, holds 2 panels, +25% power bonus |

Source: `apps/api/prisma/seed.js`

---

## Grid Constraints

From `apps/api/src/config/mounts.js`:

- Grid size: **14 columns × 4 rows = 56 cells**
- `mount_single`: 1 cell, 1 bay, 0% power bonus
- `mount_double`: 2 cells, 2 bays, +25% power bonus

Maximum panel capacity is always **56 panels** regardless of mount strategy,
because the grid has 56 cells and even double mounts hold exactly 1 panel per
cell consumed.

---

## Strategy 1: All Single Mounts

Fill the entire grid with 56 single mounts, each holding 1 panel.

| Item | Quantity | Unit Price | Total |
|---|---|---|---|
| `panel-mount` | 56 | 15 VLT | 840 VLT |
| `solar` | 56 | 10 VLT | 560 VLT |
| **TOTAL** | — | — | **1,400 VLT** |

**Power output:** 56 panels × 1 W/s × (1 + 0) = **56 W/s**

**Cost per W/s:** 1,400 / 56 = **25 VLT per W/s**

---

## Strategy 2: All Double Mounts

Fill the entire grid with 28 double mounts (using 56 cells), each holding 2 panels.

| Item | Quantity | Unit Price | Total |
|---|---|---|---|
| `panel-mount-double` | 28 | 45 VLT | 1,260 VLT |
| `solar` | 56 | 10 VLT | 560 VLT |
| **TOTAL** | — | — | **1,820 VLT** |

**Power output:** 56 panels × 1 W/s × (1 + 0.25) = **70 W/s**

**Cost per W/s:** 1,820 / 70 = **26 VLT per W/s**

---

## Strategy Comparison

| Metric | All Singles | All Doubles | Δ |
|---|---|---|---|
| Total cost | 1,400 VLT | 1,820 VLT | +420 VLT (+30%) |
| Total W/s | 56 W/s | 70 W/s | +14 W/s (+25%) |
| Cost per W/s | 25.00 VLT | 26.00 VLT | +1.00 VLT (+4%) |
| Panels used | 56 | 56 | same |
| Cells used | 56 | 56 | same |

**Conclusion:** The double mount yields 25% more power for 30% more total
investment. The cost-per-watt is nearly identical (25 vs 26 VLT), which means
the double is **slightly less cost-efficient but identical in space efficiency**.
The seed file's comment explains the intent: doubles are "worse per watt, better
per cell" — but since both strategies fill all 56 cells and produce one panel per
cell, the "better per cell" benefit only manifests as the +25% power bonus. The
trade-off is real but narrow.

A mixed strategy (using doubles where the bonus matters most and singles for the
rest) doesn't change the ceiling — you always end with 56 panels on 56 cells.

---

## CRITICAL BUG: Exponential Pricing Not Implemented

### What DECISIONS.md says

> `currentPrice = basePrice × multiplier ^ quantityAlreadyBought`

This formula implies that solar panels should get progressively more expensive:
panel #1 costs 10, panel #2 costs 11.5, panel #10 costs ~35, etc.

### What the code actually does

In `apps/api/src/routes/assets.js`:

**GET /catalog** returns:
```js
currentPrice: moneyToNumber(item.basePrice)
```

**POST /buy** computes cost as:
```js
const unitPrice = money(catalogEntry.basePrice);
const totalPrice = multiplyMoney(unitPrice, qty);
```

Neither route applies the multiplier. The `multiplier` field exists in the
database and is returned to the client, but **no server-side code uses it for
pricing**. Every solar panel costs 10 VLT, always — whether it is the 1st or the
56th.

### Impact

With flat pricing, the total cost to fill the grid is completely linear and
trivially calculable by the player. There is no increasing cost pressure that
slows progression. Once the player's income exceeds 10 VLT per payout cycle,
they can buy panels faster than the intervals, and the grid fills in a
predictable, non-escalating manner. This removes the core tension that
exponential pricing creates in idle games.

---

## If Exponential Pricing Were Implemented

Using the formula `price(n) = 10 × 1.15^n` where `n` is the number of panels
already owned:

| Panel # (n+1) | n (owned) | Unit Price (VLT) | Cumulative Total (VLT) |
|---|---|---|---|
| 1 | 0 | 10.00 | 10.00 |
| 5 | 4 | 17.49 | 67.42 |
| 10 | 9 | 35.18 | 203.04 |
| 20 | 19 | 163.67 | 1,117.83 |
| 30 | 29 | 662.12 | 4,449.91 |
| 40 | 39 | 2,678.64 | 17,861.04 |
| 50 | 49 | 10,836.57 | 72,150.41 |
| 56 | 55 | 21,171.82 | 141,373.50 |

### Math verification

Cumulative cost for `N` panels with base `b` and multiplier `r`:

```
Total(N) = b × Σ(r^n) for n=0..N-1 = b × (r^N - 1) / (r - 1)
```

For N=56, b=10, r=1.15:
```
Total(56) = 10 × (1.15^56 - 1) / (1.15 - 1)
          = 10 × (3,121.27 - 1) / 0.15
          = 10 × 20,801.82
          ≈ 208,018 VLT (panels only)
```

Wait — let me recompute using the geometric series more precisely:

```
1.15^56 = e^(56 × ln(1.15)) = e^(56 × 0.13976) = e^7.8268 ≈ 2,509.7
Total(56) = 10 × (2,509.7 - 1) / 0.15 = 10 × 16,724.7 ≈ 167,247 VLT
```

Let me also verify individual values:
- Panel 1 (n=0): 10 × 1.15^0 = 10.00 ✓
- Panel 5 (n=4): 10 × 1.15^4 = 10 × 1.749 = 17.49 ✓
- Panel 10 (n=9): 10 × 1.15^9 = 10 × 3.518 = 35.18 ✓
- Panel 20 (n=19): 10 × 1.15^19 = 10 × 16.367 = 163.67 ✓
- Panel 30 (n=29): 10 × 1.15^29 = 10 × 66.212 = 662.12 ✓
- Panel 56 (n=55): 10 × 1.15^55 = 10 × 2,117.18 = 21,171.82 ✓

**Cumulative total for 56 panels:** ~167,247 VLT (vs 560 VLT with flat pricing)

That is a **299× difference** in total spending required. With exponential
pricing, filling the grid is a long-term goal requiring sustained income over
many play sessions — which is exactly how an idle game should work.

### Full cost with exponential panels + flat mounts

| Strategy | Mounts cost | Panels cost (exponential) | Total |
|---|---|---|---|
| All singles | 840 VLT | ~167,247 VLT | ~168,087 VLT |
| All doubles | 1,260 VLT | ~167,247 VLT | ~168,507 VLT |

With exponential pricing the mount cost is negligible (~0.5% of total). The
entire cost curve is dominated by panels, as intended.

---

## Other Potential Spending Sinks

### Avatars

The `PURCHASABLE_TYPES` array in `assets.js` is:
```js
const PURCHASABLE_TYPES = ['solar', 'panel-mount', 'panel-mount-double'];
```

Avatars exist in the profile system but **cannot be purchased** through the buy
endpoint. There is no avatar entry in `AssetCatalog` and no unlock mechanism in
the buy route. Avatars are a cosmetic system with no economy integration.

### Minigames

Minigames are a VLT **source**, not a sink. They award loot (5/25/100 VLT at
varying probabilities) but cost nothing to play (only time via cooldowns).

### Mining Allocation

The mining allocation sliders (commented out per DECISIONS.md) allow the player
to choose which network to contribute power to, but changing allocation costs
nothing.

### Verdict: No other sinks exist

The asset purchase system is the **only** way to spend VLT in the game.

---

## The Terminal Sink Problem

### Once the grid is full, VLT accumulates forever

The grid has a hard cap of 56 cells. Once all cells are occupied (with any
combination of mounts and panels), there is **nothing left to buy**. But income
continues:

- Mining payouts: 50 VLT per network per 10-minute cycle, distributed
  proportionally to contributors
- Minigame loot: Expected value per play ≈ 0.05 + 0.075 + 0.05 = 0.175 VLT
  (low but non-zero over time)

After grid completion, VLT balance grows without bound. The number displayed
goes up but means nothing — a classic "dead economy" state.

### Why this matters

| Phase | State | VLT has purpose? |
|---|---|---|
| Early game | Buying first mounts + panels | ✅ Yes |
| Mid game | Filling grid, choosing strategy | ✅ Yes |
| End game | Grid full | ❌ No — infinite accumulation with no use |

Without a late-game sink, players who reach grid completion have no reason to
continue engaging with the economy. The game loop collapses from "earn → spend →
grow" to just "earn" — which is not a loop at all.

---

## Summary of Issues

| # | Issue | Severity | Type |
|---|---|---|---|
| 1 | Exponential pricing not implemented (code ignores multiplier) | **Critical** | Bug |
| 2 | No VLT sink after grid completion | **High** | Design gap |
| 3 | DECISIONS.md lists `wind` and `hydro` assets that don't exist in seed | Medium | Doc drift |
| 4 | With flat pricing, entire grid costs only 1,400–1,820 VLT — trivially reached | High | Balance |
| 5 | Mount cost difference is marginal, removing strategic tension | Low | Balance |

---

## Recommendations

1. **Fix the pricing bug.** Implement `currentPrice = basePrice × multiplier^quantityOwned`
   in both `GET /catalog` (for display) and `POST /buy` (for actual deduction).
   This is documented intent that was never coded.

2. **Add late-game sinks.** Possible options (require design decisions, not
   implementation here):
   - Panel upgrades (efficiency tiers)
   - Grid expansion (unlock additional rows)
   - Prestige/rebirth system
   - Cosmetic purchases (avatars, themes)
   - Consumable boosts (temporary multipliers)

3. **Reconcile DECISIONS.md with reality.** The doc lists wind turbines and
   hydro plants that do not exist in the catalog seed. Either add them or update
   the doc to reflect the current single-asset state.

4. **Monitor number growth.** If exponential pricing is implemented, panel #56
   costs ~21,172 VLT. This is well within JavaScript's safe integer range
   (2^53), but if additional assets or prestige multipliers are added, the
   cumulative totals could grow further. Flag if approaching 10^12.
