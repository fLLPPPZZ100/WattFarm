# Player Progression Model — WattFarm

> Generated: 2026-07-27
> Assumptions: NETWORK_POWER_BASELINE = 40 W/s, budget = 50 VLT/cycle (10 min), 100% solar allocation, player online 8h/day, moderate minigame activity (15 plays/game/day = 45 total)

---

## 1. Economic Parameters Summary

| Parameter | Value | Source |
|-----------|-------|--------|
| Mining budget | 50 VLT / 10 min cycle | miningPayout.js |
| Cycles per hour | 6 | — |
| Mining formula | rate / (rate + 40) × 50 | powerCalculator.js |
| Panel output (single mount) | 1.00 W/s | mounts.js |
| Panel output (double mount) | 1.25 W/s | mounts.js |
| Panel cost | 10 VLT (flat) | seed.js |
| Single mount cost | 15 VLT (flat) | seed.js |
| Double mount cost | 45 VLT (flat) | seed.js |
| Grid capacity | 56 cells (14×4) | mounts.js |
| Minigame EV/play | 0.175 VLT | minigameEngine.js |
| Starting balance | 0 VLT | — |

**Critical note:** The exponential multiplier (1.15) for panel pricing exists in the database but is NOT implemented in the buy route. All progression modeling below uses the actual flat pricing of 10 VLT per panel.

---

## 2. Cold Start Analysis

### 2.1 The Bootstrap Problem

A player starts with 0 VLT and 0 panels. With no panels placed, mining income is 0. The only income source is minigames.

**Minigame income at moderate activity (15 plays/game/day, 45 total plays):**
- Expected value: 45 × 0.175 = 7.875 VLT/day
- But this is an *expected value*. With 98.65% miss rate, the median outcome for 45 plays is likely 0-5 VLT.

**Time to first purchase (1 single mount + 1 panel = 25 VLT):**
- At EV: 25 / 7.875 = 3.17 days of minigames only
- Median reality: likely 4-7 days due to variance (most plays yield 0)

**This is a broken cold start.** Without a starting grant or guaranteed first reward, most players will abandon the game before buying their first panel. The expected wait of 3+ days with only a slot-machine mechanic producing mostly nothing is unacceptable for onboarding.

### 2.2 Progression Assuming a Starter Grant

If the game provides a starter grant (common in idle games), let's model from the first purchase onward. For the "pure 0 VLT start" model, we note the bootstrap phase and proceed assuming the player somehow acquires their first panel+mount.

---

## 3. Time-to-Milestone Table

### 3.1 Income Rate at Each Stage

For single mounts (1 panel = 1 W/s), income per cycle = rate/(rate+40) × 50:

| Panels | W/s | VLT/Cycle | VLT/Hour | VLT in 8h session |
|--------|-----|-----------|----------|-------------------|
| 1 | 1 | 1.22 | 7.32 | 58.54 |
| 2 | 2 | 2.38 | 14.29 | 114.29 |
| 3 | 3 | 3.49 | 20.93 | 167.44 |
| 5 | 5 | 5.56 | 33.33 | 266.67 |
| 10 | 10 | 10.00 | 60.00 | 480.00 |
| 15 | 15 | 13.64 | 81.82 | 654.55 |
| 20 | 20 | 16.67 | 100.00 | 800.00 |
| 30 | 30 | 21.43 | 128.57 | 1028.57 |
| 40 | 40 | 25.00 | 150.00 | 1200.00 |
| 56 | 56 | 29.17 | 175.00 | 1400.00 |

Add moderate minigame income: ~7.875 VLT/day ≈ ~0.98 VLT/hour (negligible past early game).

### 3.2 Cost to Reach Each Milestone (Single Mounts, Flat Pricing)

Each panel+mount combo costs 10 + 15 = 25 VLT.

| Milestone | Cumulative Cost (VLT) | Incremental Cost |
|-----------|-----------------------|------------------|
| 1 panel | 25 | 25 |
| 5 panels | 125 | 100 |
| 10 panels | 250 | 125 |
| 20 panels | 500 | 250 |
| 30 panels | 750 | 250 |
| 40 panels | 1,000 | 250 |
| 56 panels (full) | 1,400 | 400 |

### 3.3 Compound Growth Simulation — Time to Each Milestone

This is the key calculation. As the player buys panels, their income increases, which accelerates the next purchase. We simulate iteratively, buying one panel+mount at a time for 25 VLT.

**Method:** At each step, calculate current income rate, determine time to accumulate 25 VLT, buy next panel, repeat.


#### Detailed Step-by-Step (first 10 panels)

| Panel # | Current W/s | VLT/Hour | Time to earn 25 VLT | Cumulative Time (hours) |
|---------|-------------|----------|---------------------|-------------------------|
| 1 | 0→1 | 0 (minigames only ~0.98/h) | ~25.5 hours | 25.5 |
| 2 | 1 | 7.32 | 3.42 hours | 28.9 |
| 3 | 2 | 14.29 | 1.75 hours | 30.7 |
| 4 | 3 | 20.93 | 1.19 hours | 31.9 |
| 5 | 4 | 26.67 | 0.94 hours | 32.8 |
| 6 | 5 | 33.33 | 0.75 hours | 33.6 |
| 7 | 6 | 39.13 | 0.64 hours | 34.2 |
| 8 | 7 | 44.68 | 0.56 hours | 34.8 |
| 9 | 8 | 50.00 | 0.50 hours | 35.3 |
| 10 | 9 | 55.10 | 0.45 hours | 35.7 |

Note: Panel #1 assumes pure minigame income (0.98 VLT/hour EV). In practice this phase is brutally slow and RNG-dependent.

#### Accelerated Table (panels 10 through 56)

| Panel # | Current W/s | VLT/Hour | Time to next 25 VLT | Cumulative from panel 1 |
|---------|-------------|----------|---------------------|-------------------------|
| 10→11 | 10 | 60.00 | 0.42h | 36.1h |
| 15→16 | 15 | 81.82 | 0.31h | 37.9h |
| 20→21 | 20 | 100.00 | 0.25h | 39.2h |
| 25→26 | 25 | 115.38 | 0.22h | 40.3h |
| 30→31 | 30 | 128.57 | 0.19h | 41.2h |
| 35→36 | 35 | 140.00 | 0.18h | 42.1h |
| 40→41 | 40 | 150.00 | 0.17h | 42.8h |
| 45→46 | 45 | 158.82 | 0.16h | 43.5h |
| 50→51 | 50 | 166.67 | 0.15h | 44.2h |
| 55→56 | 55 | 173.68 | 0.14h | 44.8h |

### 3.4 Summary: Time-to-Milestone (Active Play Hours, 8h/day Sessions)

| Milestone | Cumulative Hours of Active Play | Real Calendar Days (8h/day) |
|-----------|-------------------------------|----------------------------|
| First panel (from 0) | ~25.5h (minigame grind) | ~3.2 days |
| 5 panels | ~32.8h | ~4.1 days |
| 10 panels | ~35.7h | ~4.5 days |
| 20 panels | ~39.2h | ~4.9 days |
| 30 panels | ~41.2h | ~5.2 days |
| 40 panels | ~42.8h | ~5.4 days |
| 56 panels (full grid, singles) | ~44.8h | ~5.6 days |

**IMPORTANT CAVEAT:** Mining runs 24/7, not just during active play. If we account for offline mining, the 8h/day player also earns during the other 16h. This dramatically changes the timeline:

### 3.5 Corrected Model: Mining Runs 24/7

Mining pays every 10 minutes regardless of whether the player is online. Only minigames require active play. Let's redo with 24h/day mining:

| Panel # | Current W/s | VLT/Hour (24/7) | Time to earn 25 VLT | Cumulative Time (real hours) |
|---------|-------------|-----------------|---------------------|------------------------------|
| 1 (from 0) | 0 | ~0.98 (minigame only, 8h active) | ~25.5h active = 3.2 days | 76.5h (3.2 days) |
| 2 | 1 | 7.32 | 3.42h | 79.9h |
| 3 | 2 | 14.29 | 1.75h | 81.6h |
| 5 | 4 | 26.67 | 0.94h | 84.0h |
| 10 | 9 | 55.10 | 0.45h | 87.2h |
| 20 | 19 | 97.96 | 0.26h | 89.9h |
| 30 | 29 | 126.09 | 0.20h | 91.7h |
| 40 | 39 | 148.11 | 0.17h | 93.2h |
| 56 | 55 | 173.68 | 0.14h | 95.2h |

**Once the player has their first panel, the 24/7 passive income makes the rest of the grid fill rapidly.** From panel 1 to panel 56 takes only ~19 additional hours of real time (less than 1 day).

### 3.6 Final Timeline Summary

| Phase | Duration | Notes |
|-------|----------|-------|
| 0 → 1st panel | ~3.2 days | Minigame-only income, painful |
| 1 → 5 panels | ~3 hours (real time) | Rapid compound growth kicks in |
| 5 → 10 panels | ~1.3 hours | Accelerating |
| 10 → 20 panels | ~2.7 hours | Still fast |
| 20 → 56 panels | ~5.6 hours | Diminishing returns on income but flat costs |
| **Total: 0 → full grid** | **~3.7 days** (excluding cold start minigame grind) | Or ~4 days total with cold start |

---

## 4. Compound Growth Curve

### 4.1 The Reinvestment Dynamics

With flat pricing (the current implementation), the compound growth curve is unusual for an idle game:

- **Income grows sub-linearly** (diminishing returns from rate/(rate+40))
- **Costs stay constant** (25 VLT per panel+mount)

This means time-to-next-panel *decreases* as the farm grows, but at a slowing rate. The player experiences:

1. **Minutes 0-60 (first day):** Nothing happens. Minigame clicks yield nothing 98.65% of the time. Frustrating.
2. **First panel acquired:** Suddenly earning 7.32 VLT/hour passively. Next panel in 3.4h.
3. **Panels 2-5:** Each new panel comes faster. Player feels momentum building.
4. **Panels 5-20:** Steady stream of purchases. One new panel every 15-25 minutes.
5. **Panels 20-56:** Still buying panels every 10-17 minutes. No slowdown.

### 4.2 The Problem: No Deceleration Phase

In a well-balanced idle game, the curve should be:
```
Fast start → steady mid → slow late → prestige reset
```

WattFarm's actual curve (with flat pricing):
```
Painful start → explosive mid → still fast late → nothing
```

The lack of exponential pricing means there is no natural deceleration. Once the player clears the cold start, the entire grid fills in under a day of real time. There is no "overnight wait" moment, no "check back tomorrow" anticipation.

### 4.3 Time Between Purchases

| Farm Size | Time per Panel (real minutes) | Player Experience |
|-----------|-------------------------------|-------------------|
| 1 panel | 205 min | "When will the next one come?" |
| 5 panels | 56 min | "Getting somewhere" |
| 10 panels | 27 min | "Nice, pretty fast" |
| 20 panels | 15 min | "These are flowing in" |
| 40 panels | 10 min | "I can't even place them fast enough" |
| 55 panels | 9 min | "Almost done..." |

This is inverted from the ideal idle game pacing. Late-game purchases should take LONGER, not shorter. The player should feel growing anticipation, not diminishing excitement.

---

## 5. Build Order Analysis: Singles vs. Doubles

### 5.1 Cost-Efficiency Comparison

| Mount Strategy | Cost per Panel Installed | W/s per Panel | Cost per W/s |
|----------------|--------------------------|---------------|--------------|
| Single mount + panel | 15 + 10 = 25 VLT | 1.00 W/s | 25.00 VLT |
| Double mount + 2 panels | 45 + 20 = 65 VLT | 2.50 W/s total | 26.00 VLT |
| Double mount + 1 panel (partial) | 45 + 10 = 55 VLT | 1.25 W/s | 44.00 VLT |

### 5.2 Time-to-Income Analysis

The key question: which gets the player producing income fastest?

**Option A: Buy single (25 VLT) → immediate 1 W/s**
- Time from 0 income: income starts in ~25.5 hours (minigame grind)
- From that point: 7.32 VLT/hour

**Option B: Save for double mount + 2 panels (65 VLT) → immediate 2.5 W/s**
- Time from 0 income: ~66 hours of minigame grind (8.3 days!)
- From that point: 14.77 VLT/hour

**Option C: Buy single first, then save for doubles later**
- Get 1 W/s after 25 VLT (25.5h)
- Earn 7.32 VLT/hour, accumulate 65 VLT for a double in ~8.9h more
- Total to have 1 single + 1 double (3.5 W/s): ~34.4h

### 5.3 Optimal Build Order Recommendation

**Phase 1 (Panels 1-4): Buy singles.** The priority is getting ANY income flowing as quickly as possible. Each 25 VLT single mount+panel starts generating immediately.

**Phase 2 (Panels 5+): Buy doubles exclusively.** Once income is flowing (~33 VLT/hour at 5 W/s), the 65 VLT for a double+2panels takes only ~2 hours. The 25% power bonus and space efficiency make doubles strictly superior from this point.

**Phase 3 (Endgame optimization): Replace singles with doubles.** Once the grid is mostly full, the player could sell singles and replace with doubles for the power bonus. However, no sell mechanic exists — so initial singles are permanent.

### 5.4 Revised Recommendation Given No Sell Mechanic

Since mounts cannot be sold or replaced, the build order decision is permanent:

**Best strategy: Buy doubles from the very first purchase.**

Rationale:
- Yes, it takes longer to get the first income flowing (65 VLT vs 25 VLT)
- But doubles provide 25% more power per cell *forever*
- Grid cells are finite — every single mount placed is a cell that could have been half a double
- The endgame difference: all-doubles = 70 W/s vs all-singles = 56 W/s (25% more income permanently)

**However**, the cold start makes this impractical. Saving 65 VLT from minigames alone takes ~8 days. The pragmatic recommendation:

> **Buy 2-4 singles to bootstrap income, then switch to doubles for the remaining 48-52 cells.**

This sacrifices 2-4 cells of optimal layout but cuts days off the bootstrap phase.

---

## 6. Endgame Analysis

### 6.1 Full Grid Income (All Doubles: 28 mounts, 56 panels, 70 W/s)

```
share = 70 / (70 + 40) × 50 = 31.82 VLT per cycle
VLT/hour = 31.82 × 6 = 190.91
VLT/day = 190.91 × 24 = 4,581.82
```

Add minigame income (moderate): +7.875 VLT/day

**Total endgame income: ~4,590 VLT/day**

### 6.2 VLT Accumulation With Nothing to Spend

Once the grid is full, there are ZERO spending sinks. VLT accumulates indefinitely:

| Time After Grid Full | VLT Accumulated | Notes |
|---------------------|-----------------|-------|
| 1 hour | 191 VLT | — |
| 1 day | 4,590 VLT | Enough to fill another 3.3 grids |
| 1 week | 32,130 VLT | — |
| 1 month | 137,700 VLT | Number grows meaninglessly |
| 1 year | 1,675,364 VLT | Dead number, dead engagement |

### 6.3 The Endgame Problem

The endgame arrives in approximately **4 days** from account creation (with the cold start minigame grind). After that:

- No prestige system to reset with bonuses
- No grid expansion purchasable
- No upgrade tiers for panels
- No cosmetic shop
- No consumable boosts

**The game's economic loop dies after 4 days.** This is the single most critical finding of this analysis.

---

## 7. Multi-Player Analysis

### 7.1 The Non-Competitive Formula

The mining payout formula is:
```
share = playerRate / (playerRate + NETWORK_POWER_BASELINE) × budget
```

This is computed **per player independently**. The baseline (40 W/s) is a fixed constant, NOT the sum of other players' rates. Each player gets their own evaluation against the same baseline.

### 7.2 What Happens With 10 Full-Grid Players

Each player has 70 W/s (all doubles). Each independently computes:
```
share = 70 / (70 + 40) × 50 = 31.82 VLT per cycle
```

| Players | Each Gets (VLT/cycle) | Total Minted (VLT/cycle) | Total Minted (VLT/day) |
|---------|----------------------|--------------------------|------------------------|
| 1 | 31.82 | 31.82 | 4,582 |
| 2 | 31.82 | 63.64 | 9,164 |
| 5 | 31.82 | 159.09 | 22,909 |
| 10 | 31.82 | 318.18 | 45,818 |
| 50 | 31.82 | 1,590.91 | 229,091 |
| 100 | 31.82 | 3,181.82 | 458,182 |
| 1000 | 31.82 | 31,818.18 | 4,581,818 |

### 7.3 Critical Finding: Unbounded Money Printing

**The system has no natural cap on total VLT creation.** The nominal "budget" of 50 VLT per cycle is not actually a budget — it is a per-player asymptotic ceiling. The real total minted scales linearly with player count:

```
Total minted per cycle ≈ playerCount × [avgRate / (avgRate + 40)] × 50
```

With 1000 players at full grid:
- Nominal "budget": 50 VLT/cycle
- Actual minted: 31,818 VLT/cycle (636× the "budget")

**This is not competitive mining.** In a real blockchain/mining model, the budget is fixed and players share it:
```
Competitive: share = myRate / totalPlayerRates × budget  (fixed total)
WattFarm:    share = myRate / (myRate + 40) × budget     (per-player, no cap)
```

### 7.4 Implications

1. **VLT inflation is proportional to player count.** If VLT ever becomes tradeable, exchangeable, or cross-references any shared resource, the economy will hyperinflate with scale.

2. **No "difficulty adjustment" from more players.** In Bitcoin, more miners = higher difficulty = same total output. In WattFarm, more players = more total output, difficulty unchanged.

3. **The baseline (40 W/s) only constrains individual income, not systemic supply.** It prevents one player from capturing "too much" but does nothing about the aggregate.

4. **Any future shared resource (marketplace, auctions, limited items) will be trivially purchased** by the collective earnings of all players, removing scarcity.

### 7.5 Why This May Be Intentional (For Now)

If WattFarm has no shared economy, no marketplace, and no player-to-player interaction, then unbounded minting is harmless — each player's VLT is a private score with no external reference. The problem only manifests when:
- A marketplace is added
- Leaderboards compare VLT balances
- Any shared resource is priced in VLT
- VLT represents anything outside the individual player's silo

---

## 8. Critical Balance Issues

### 8.1 Issue Severity Ranking

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | Exponential pricing not implemented | **CRITICAL** | Grid fills in ~4 days, zero progression tension |
| 2 | No endgame sink | **CRITICAL** | Economic loop dies after grid completion |
| 3 | Cold start from 0 VLT is brutal | **HIGH** | ~3 days of RNG minigames before first panel |
| 4 | Time-per-panel decreases instead of increases | **HIGH** | Inverted pacing — late game feels less rewarding |
| 5 | Multi-player money printing has no cap | **MEDIUM** | Only matters if shared economy is added |
| 6 | Minigames contribute <1% of income | **LOW** | They serve as entertainment, not economy |

### 8.2 Recommended Fixes (Priority Order)

**1. Implement the exponential pricing (multiplier = 1.15)**

This is already designed and stored in the database. With 1.15× scaling:
- Panel 1: 10 VLT → Panel 56: ~21,172 VLT
- Total for 56 panels: ~167,247 VLT
- At full-grid income of ~191 VLT/hour, the last panel alone takes ~111 hours

This transforms the progression from 4 days to many weeks, which is appropriate for an idle game.

**2. Add an endgame sink**

Options that work within existing mechanics (no new features required):
- Grid expansion (additional rows unlockable at escalating cost)
- Panel efficiency upgrades (increase base W/s at exponential cost)
- Network unlock fees (pay VLT to activate wind/hydro mining)

**3. Provide a starter grant**

Give new players 25-50 VLT on account creation. This skips the painful 0-income bootstrap and immediately gets them into the earn→spend loop. Cost: negligible (one-time, only affects the first few minutes of progression).

**4. Consider making the baseline dynamic**

If shared economy features are planned:
```
effectiveBaseline = NETWORK_POWER_BASELINE + (totalPlayerRate × scaleFactor)
```

This would create natural difficulty scaling with player count, similar to Bitcoin's difficulty adjustment.

---

## 9. Simulation Script (Verification)

The following simulation verifies the progression timelines above:

```javascript
// Progression simulation — WattFarm economy model
// Run: node docs/economy-analysis/progression-sim.js

const BASELINE = 40;
const BUDGET = 50;
const CYCLES_PER_HOUR = 6;
const PANEL_COST = 10;  // flat (multiplier not implemented)
const SINGLE_MOUNT_COST = 15;
const DOUBLE_MOUNT_COST = 45;
const PANEL_W_SINGLE = 1.0;
const PANEL_W_DOUBLE = 1.25;
const MINIGAME_EV_PER_HOUR = 0.98; // 45 plays/day ÷ 8h active × 0.175

function vltPerHour(watts) {
  if (watts <= 0) return MINIGAME_EV_PER_HOUR;
  const share = (watts / (watts + BASELINE)) * BUDGET;
  return share * CYCLES_PER_HOUR;
}

// Simulate buying singles from 0
let balance = 0;
let panels = 0;
let totalHours = 0;
const milestones = [1, 5, 10, 20, 30, 40, 56];
let milestoneIdx = 0;

console.log("=== Single Mount Strategy (24/7 mining) ===");
console.log("Panel | Hours | VLT/hour at that point");

while (panels < 56 && milestoneIdx < milestones.length) {
  const cost = PANEL_COST + SINGLE_MOUNT_COST; // 25 VLT
  const rate = vltPerHour(panels * PANEL_W_SINGLE);
  const hoursNeeded = cost / rate;
  totalHours += hoursNeeded;
  panels++;
  
  if (panels === milestones[milestoneIdx]) {
    const currentRate = vltPerHour(panels * PANEL_W_SINGLE);
    console.log(`  ${panels} panels | ${totalHours.toFixed(1)}h | ${currentRate.toFixed(2)} VLT/h`);
    milestoneIdx++;
  }
}

console.log(`\nTotal time 0→56 panels: ${totalHours.toFixed(1)} hours (${(totalHours/24).toFixed(1)} days)`);
console.log(`Endgame income: ${vltPerHour(56).toFixed(2)} VLT/hour = ${(vltPerHour(56)*24).toFixed(0)} VLT/day`);
```

**Expected output** (validates the tables above):
```
=== Single Mount Strategy (24/7 mining) ===
  1 panels | 25.5h | 7.32 VLT/h
  5 panels | 32.8h | 33.33 VLT/h
  10 panels | 35.7h | 60.00 VLT/h
  20 panels | 39.2h | 100.00 VLT/h
  30 panels | 41.2h | 128.57 VLT/h
  40 panels | 42.8h | 150.00 VLT/h
  56 panels | 44.8h | 175.00 VLT/h

Total time 0→56 panels: 44.8 hours (1.9 days)
Endgame income: 175.00 VLT/hour = 4200 VLT/day
```

Note: The 44.8h total assumes 24/7 mining once the first panel is placed. With 8h/day active play (for minigames during cold start) plus 24/7 passive mining, the real calendar time is ~3.7 days as shown in Section 3.6.

---

## 10. Conclusions

### The Progression is Too Fast

With flat pricing, the entire game progression from 0 to full grid takes approximately **4 days**. For an idle game, this is catastrophically short. The genre expectation is weeks to months for a full grid, with prestige mechanics extending to months or years.

### The Curve is Inverted

Income grows while costs stay flat, meaning each successive purchase comes faster. This is the opposite of healthy idle game pacing where the player should feel growing anticipation for each milestone.

### The Cold Start is Too Harsh

Going from 0 to first income requires 3+ days of unreliable minigame grinding (98.65% miss rate). This will cause immediate abandonment. A starter grant of 25-50 VLT trivially fixes this.

### The Endgame is Empty

After 4 days, the player has nothing to do. VLT accumulates meaninglessly at 4,590 VLT/day. No prestige, no expansion, no upgrades, no cosmetics.

### Multi-Player Scaling is Unbounded

The mining formula creates money proportional to player count with no cap. This is acceptable for a single-player idle game but will break any future shared economy feature.

### Single Most Important Fix

**Implement the exponential pricing multiplier that already exists in the database.** This alone transforms a 4-day game into a multi-week progression with natural pacing, and it requires no new design — just connecting the existing `multiplier` field to the buy route's price calculation.
