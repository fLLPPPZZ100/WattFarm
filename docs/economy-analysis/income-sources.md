# WattFarm Economy Analysis: Income Sources

> Generated: 2026-07-27  
> Baseline parameters: `NETWORK_POWER_BASELINE = 40 W/s`, `BUDGET_PER_NETWORK = 50 VLT/cycle`, cycle = 10 minutes

---

## 1. Mining Payouts (Primary Income)

### 1.1 Core Formula

```
share = playerRate / (playerRate + NETWORK_POWER_BASELINE) × budget
```

- **Budget**: 50 VLT per cycle (every 10 minutes)
- **Cycles per hour**: 6
- **Cycles per day**: 144
- **NETWORK_POWER_BASELINE (default)**: 40 W/s

### 1.2 Power Rate Calculation

Panel output depends on the mount type:

| Mount Type     | Bays | Power Bonus | Output per Panel (W/s) |
|----------------|------|-------------|------------------------|
| mount_single   | 1    | 0%          | 1.00                   |
| mount_double   | 2    | +25%        | 1.25                   |

**Grid capacity**: 14 columns × 4 rows = 56 cells

Maximum panels depend on mount composition:
- All `mount_single` (1 cell, 1 bay): 56 panels × 1.00 W/s = **56.00 W/s**
- All `mount_double` (2 cells, 2 bays): 28 mounts × 2 panels × 1.25 W/s = **70.00 W/s**
- Mixed layouts fall between these bounds

For this analysis, we model two scenarios:
- **Conservative** (all single mounts): panels = cells used
- **Optimal** (all double mounts): panels = cells used (each double mount uses 2 cells, holds 2 panels at 1.25 W/s each)

### 1.3 Mining Income at Various Farm Sizes (100% Solar Allocation)

#### Scenario A: All mount_single (1 W/s per panel)

| Panels | Rate (W/s) | Share Formula                | VLT/Cycle | VLT/Hour | VLT/Day |
|--------|-----------|------------------------------|-----------|----------|---------|
| 1      | 1.00      | 1/(1+40) × 50 = 1.2195      | 1.22      | 7.32     | 175.61  |
| 5      | 5.00      | 5/(5+40) × 50 = 5.5556      | 5.56      | 33.33    | 800.00  |
| 10     | 10.00     | 10/(10+40) × 50 = 10.00     | 10.00     | 60.00    | 1440.00 |
| 20     | 20.00     | 20/(20+40) × 50 = 16.6667   | 16.67     | 100.00   | 2400.00 |
| 40     | 40.00     | 40/(40+40) × 50 = 25.00     | 25.00     | 150.00   | 3600.00 |
| 56     | 56.00     | 56/(56+40) × 50 = 29.1667   | 29.17     | 175.00   | 4200.00 |

#### Scenario B: All mount_double (1.25 W/s per panel, 2 panels per mount)

With all double mounts, each mount occupies 2 cells and holds 2 panels at 1.25 W/s each = 2.5 W/s per mount.

| Panels | Mounts | Cells Used | Rate (W/s) | Share Formula                  | VLT/Cycle | VLT/Hour | VLT/Day  |
|--------|--------|-----------|-----------|--------------------------------|-----------|----------|----------|
| 2      | 1      | 2         | 2.50      | 2.5/(2.5+40) × 50 = 2.9412    | 2.94      | 17.65    | 423.53   |
| 10     | 5      | 10        | 12.50     | 12.5/(12.5+40) × 50 = 11.9048 | 11.90     | 71.43    | 1714.29  |
| 20     | 10     | 20        | 25.00     | 25/(25+40) × 50 = 19.2308     | 19.23     | 115.38   | 2769.23  |
| 40     | 20     | 40        | 50.00     | 50/(50+40) × 50 = 27.7778     | 27.78     | 166.67   | 4000.00  |
| 56     | 28     | 56        | 70.00     | 70/(70+40) × 50 = 31.8182     | 31.82     | 190.91   | 4581.82  |

### 1.4 Key Observations — Mining

1. **Diminishing returns are steep.** Going from 1 panel to 56 panels (56× the hardware) only yields ~24× the income (single mounts) due to the share formula's asymptotic nature.
2. **The theoretical ceiling is 50 VLT/cycle (300 VLT/hour, 7200 VLT/day)** — the full budget. This is unreachable because `rate / (rate + 40)` never equals 1.
3. **At full grid (optimal layout), a player captures ~63.6% of the budget** (31.82/50). The remaining 36.4% is permanently "lost" to the baseline.
4. **Mining is passive income** — it runs every 10 minutes regardless of player activity, 24/7.

### 1.5 Marginal Return per Additional Panel

| From → To (single) | ΔRate | ΔVLT/Day | Marginal VLT/Day per Panel |
|---------------------|-------|----------|----------------------------|
| 0 → 1              | +1    | +175.61  | 175.61                     |
| 1 → 5              | +4    | +624.39  | 156.10                     |
| 5 → 10             | +5    | +640.00  | 128.00                     |
| 10 → 20            | +10   | +960.00  | 96.00                      |
| 20 → 40            | +20   | +1200.00 | 60.00                      |
| 40 → 56            | +16   | +600.00  | 37.50                      |

The marginal value of each additional panel drops from ~175 VLT/day (first panel) to ~37.5 VLT/day (panels 41-56). This is healthy diminishing returns — each panel still helps, but upgrading mount types (single → double) becomes the more efficient path.

---

## 2. Minigame Income (Active Income)

### 2.1 Loot Table

| Result  | Probability | Payout (VLT) | Contribution to EV |
|---------|-------------|--------------|-------------------|
| none    | 98.65%      | 0            | 0                 |
| common  | 1.00%       | 5            | 0.05              |
| rare    | 0.30%       | 25           | 0.075             |
| epic    | 0.05%       | 100          | 0.05              |

**Expected Value (EV) per play = 0.175 VLT**

### 2.2 Cooldown Structure

| Tier | Plays Today | Cooldown | Effective Rate       |
|------|-------------|----------|---------------------|
| 0    | 0-4         | 10s      | ~6 plays/min        |
| 1    | 5-9         | 60s      | 1 play/min          |
| 2    | 10-19       | 5 min    | 0.2 plays/min       |
| 3    | 20+         | 10 min   | 0.1 plays/min       |

### 2.3 Time Required per Activity Level (per game)

**Minimum time to reach N plays:**

| Plays | Calculation                                                         | Time Required |
|-------|---------------------------------------------------------------------|---------------|
| 5     | 5 × 10s = 50s                                                      | ~50 seconds   |
| 10    | (5 × 10s) + (5 × 60s) = 350s                                      | ~5.8 minutes  |
| 15    | (5 × 10s) + (5 × 60s) + (5 × 300s) = 1850s                       | ~30.8 minutes |
| 20    | (5 × 10s) + (5 × 60s) + (10 × 300s) = 3350s                      | ~55.8 minutes |
| 30    | (5 × 10s) + (5 × 60s) + (10 × 300s) + (10 × 600s) = 9350s       | ~2.6 hours    |
| 50    | (5 × 10s) + (5 × 60s) + (10 × 300s) + (30 × 600s) = 21350s      | ~5.9 hours    |

### 2.4 There Are 3 Games — Total Minigame Income

Each game has its own independent play counter and cooldown. A player can interleave all three.

| Activity Level | Plays/Game/Day | Total Plays/Day | EV/Day (VLT) | Time Investment |
|----------------|----------------|-----------------|---------------|-----------------|
| Casual         | 5              | 15              | 2.625         | ~2.5 min total  |
| Moderate       | 15             | 45              | 7.875         | ~1.5 hours      |
| Hardcore       | 30             | 90              | 15.75         | ~7.8 hours      |
| Maximum (50)   | 50             | 150             | 26.25         | ~17.7 hours     |

### 2.5 Variance and Streaks

The EV is extremely low (0.175 VLT/play) because 98.65% of plays yield nothing. This means:

- Over 15 plays (casual): ~85% chance of getting 0 VLT, ~14% chance of exactly 1 common (5 VLT)
- Over 90 plays (hardcore): ~54% chance of at least one common, but median daily income is still likely 0-5 VLT
- The epic (100 VLT) has a 1-in-2000 chance per play — a hardcore player (90 plays/day) expects one approximately every 22 days

**Minigame income is extremely volatile and unreliable day-to-day.**

---

## 3. Total Daily Income Ceiling

### 3.1 Combined Income Summary

| Farm Size (singles) | Mining VLT/Day | Minigame EV/Day (Hardcore) | Total EV/Day | Minigame % of Total |
|---------------------|----------------|---------------------------|--------------|---------------------|
| 1 panel             | 175.61         | 15.75                     | 191.36       | 8.2%                |
| 5 panels            | 800.00         | 15.75                     | 815.75       | 1.9%                |
| 10 panels           | 1440.00        | 15.75                     | 1455.75      | 1.1%                |
| 20 panels           | 2400.00        | 15.75                     | 2415.75      | 0.7%                |
| 40 panels           | 3600.00        | 15.75                     | 3615.75      | 0.4%                |
| 56 panels           | 4200.00        | 15.75                     | 4215.75      | 0.4%                |

### 3.2 Absolute Maximum Income

- **Mining (optimal double-mount full grid)**: 4581.82 VLT/day
- **Minigames (50 plays × 3 games, EV)**: 26.25 VLT/day
- **Combined theoretical max**: ~4608 VLT/day

**Mining dominates overwhelmingly.** Minigames contribute less than 1% of income for any player with more than a few panels. Their role is entertainment and lottery-style excitement, not a meaningful economic pillar.

---

## 4. Sensitivity to NETWORK_POWER_BASELINE

The baseline is the single most impactful economy lever. Here is daily income at various farm sizes with different baselines:

### 4.1 Full Grid Income (56 panels, all singles = 56 W/s)

| Baseline (W/s) | Share %          | VLT/Cycle | VLT/Day  | % of Budget Captured |
|-----------------|-----------------|-----------|----------|---------------------|
| 10              | 56/(56+10) = 84.8% | 42.42     | 6109.09  | 84.8%               |
| 20              | 56/(56+20) = 73.7% | 36.84     | 5305.26  | 73.7%               |
| 40 (default)   | 56/(56+40) = 58.3% | 29.17     | 4200.00  | 58.3%               |
| 60              | 56/(56+60) = 48.3% | 24.14     | 3475.86  | 48.3%               |
| 80              | 56/(56+80) = 41.2% | 20.59     | 2964.71  | 41.2%               |
| 100             | 56/(56+100) = 35.9%| 17.95     | 2584.62  | 35.9%               |
| 200             | 56/(56+200) = 21.9%| 10.94     | 1575.00  | 21.9%               |

### 4.2 Early Game Impact (5 panels, singles = 5 W/s)

| Baseline (W/s) | Share %           | VLT/Day  | Comment                         |
|-----------------|------------------|----------|----------------------------------|
| 10              | 5/(5+10) = 33.3% | 2400.00  | Very fast early game             |
| 20              | 5/(5+20) = 20.0% | 1440.00  | Comfortable pace                 |
| 40 (default)   | 5/(5+40) = 11.1% | 800.00   | Moderate grind                   |
| 60              | 5/(5+60) = 7.7%  | 553.85   | Starts to feel slow              |
| 100             | 5/(5+100) = 4.8% | 342.86   | Potentially frustrating early on |

### 4.3 Progression Ratio (Full Grid / 1 Panel)

This ratio shows how much more a maxed player earns versus a brand-new one:

| Baseline | 1 Panel VLT/Day | 56 Panel VLT/Day | Ratio |
|----------|-----------------|------------------|-------|
| 10       | 654.55          | 6109.09          | 9.3×  |
| 40       | 175.61          | 4200.00          | 23.9× |
| 100      | 51.43           | 2584.62          | 50.2× |

**Higher baselines amplify the progression gap.** At baseline=40, building from 1 to 56 panels gives a 24× income multiplier, which provides strong motivation to expand. At baseline=10, the multiplier is only 9.3×, which may feel unrewarding.

---

## 5. Degenerate Strategies and Exploit Analysis

### 5.1 Multi-Account Exploitation — NOT EXPLOITABLE

Each account's share is computed against the fixed baseline, not against other players. Multiple accounts each earn independently, but each still faces diminishing returns against the baseline. There is no way to "steal" another player's share or manipulate the pool — the baseline is synthetic, not player-derived.

**Verdict**: No multi-account exploit exists in the mining formula.

### 5.2 Allocation Slider Gaming

The allocation percentage must sum to 100%, and only solar currently pays out. Setting 100% solar is strictly optimal. There is no exploitable edge here — the other networks have budgets but no source of power.

However: **if wind/hydro ever become active**, a player who allocates across all three would earn from three separate 50 VLT budgets simultaneously. At 56 W/s split evenly (33% each = ~18.67 W/s effective per network):

```
3 × [18.67 / (18.67 + 40) × 50] = 3 × 15.90 = 47.70 VLT/cycle
```

vs. 100% in one network:

```
1 × [56 / (56 + 40) × 50] = 29.17 VLT/cycle
```

**Splitting across networks would be 64% more profitable** if all networks become active simultaneously. This is a future design concern, not a current exploit.

### 5.3 Mount Type Arbitrage

Double mounts give +25% power bonus per panel but use 2 cells per mount. Net output comparison per cell:

- `mount_single`: 1 cell → 1 panel → 1.00 W/s → **1.00 W/s per cell**
- `mount_double`: 2 cells → 2 panels → 2.50 W/s → **1.25 W/s per cell**

Double mounts are **strictly superior** in W/s per cell. If both cost the same VLT per cell of grid space, players should always use doubles. The balance lever is pricing: doubles should cost at least 25% more per cell to justify the bonus, or they completely dominate singles.

**This is not an exploit per se, but if pricing doesn't account for this, mount_single becomes a trap purchase.**

### 5.4 Minigame Cooldown Reset

Cooldowns reset daily at UTC midnight. There is no timezone exploit because the reset is server-side. However, a player who plays at 23:55 UTC and again at 00:05 UTC effectively gets two "fresh" tier-0 windows in 10 minutes. This yields at most 10 extra plays at tier 0 (worth 1.75 VLT EV) — negligible.

### 5.5 Passive vs. Active Income Imbalance

Mining runs 24/7 automatically. Minigames require active play for hours to earn <1% of mining income. This creates a situation where:

- **Optimal strategy is to never play minigames** once the novelty wears off
- The time investment is irrational from a pure VLT/hour perspective

At 5 panels: Mining pays 800 VLT/day passively. Hardcore minigaming (7.8 hours) adds 15.75 VLT — that's **2 VLT per hour of active play**, compared to mining's **33.33 VLT/hour passively**.

**Recommendation**: Either increase minigame rewards significantly (10-50× current values) or reframe them as primarily a fun/engagement mechanic with occasional jackpots, not a meaningful income source.

---

## 6. Mathematical Proof — Simulation of Hourly Accumulation

To validate the numbers above, here is the step-by-step accumulation for a player with 10 single-mount panels (10 W/s):

```
Per cycle:  10 / (10 + 40) × 50 = 10.00 VLT
Per hour:   10.00 × 6 = 60.00 VLT
Per day:    60.00 × 24 = 1440.00 VLT
```

Cross-check with the share formula:
```
share_fraction = 10 / 50 = 0.20 (20% of budget)
daily = 0.20 × 50 × 144 = 1440.00 VLT ✓
```

For 56 panels (single mounts):
```
share_fraction = 56 / 96 = 0.58333...
daily = 0.58333 × 50 × 144 = 4200.00 VLT ✓
```

---

## 7. Summary Table — Key Economic Parameters

| Parameter                    | Value            | Source File              |
|------------------------------|------------------|--------------------------|
| Mining cycle interval        | 10 minutes       | miningPayout.js (cron)   |
| Budget per network per cycle | 50 VLT           | miningPayout.js          |
| Active networks              | 1 (solar)        | miningPayout.js          |
| Network power baseline       | 40 W/s           | env.js                   |
| Panel base output            | 1 W/s            | mounts.js                |
| mount_single power bonus     | 0%               | mounts.js                |
| mount_double power bonus     | 25%              | mounts.js                |
| Grid size                    | 14×4 = 56 cells  | mounts.js                |
| Minigame EV per play         | 0.175 VLT        | minigameEngine.js        |
| Minigame loot: common        | 1% → 5 VLT      | minigameEngine.js        |
| Minigame loot: rare          | 0.30% → 25 VLT  | minigameEngine.js        |
| Minigame loot: epic          | 0.05% → 100 VLT | minigameEngine.js        |
| Minigame cooldown tiers      | 10s/60s/5m/10m   | minigameEngine.js        |
| Number of minigames          | 3                | minigameEngine.js        |

---

## 8. Conclusions

1. **Mining is the economy.** It provides 99%+ of income for any established player. Minigames are flavour, not substance.

2. **The diminishing-returns curve is well-designed.** The `rate / (rate + baseline)` formula naturally caps income without a hard ceiling, and every panel still provides positive marginal value.

3. **NETWORK_POWER_BASELINE = 40 is reasonable** for the current single-network, single-player-against-synthetic-difficulty model. It creates a ~24× income spread from first panel to full grid.

4. **Minigames need a purpose beyond VLT.** At 0.175 VLT/play, they cannot compete with passive mining. Either raise rewards, add unique drops (cosmetics, boosts), or accept they are purely an engagement mechanic.

5. **Double mounts are strictly dominant** in power per cell. Pricing must enforce the tradeoff, or single mounts become dead content.

6. **Multi-network activation will significantly increase income** if a player can allocate across all three simultaneously. The baseline per network remains constant, so total extractable VLT triples. Plan spending sinks accordingly before enabling wind/hydro.
