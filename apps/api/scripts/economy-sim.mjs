/**
 * Economy balance simulator.
 *
 * Pure arithmetic — no database, no network. Reads nothing and writes nothing,
 * so it is safe to run at any time:
 *
 *   node apps/api/scripts/economy-sim.mjs
 *   node apps/api/scripts/economy-sim.mjs --model=proposed
 *
 * ## Why this exists
 *
 * Every balance claim in `docs/economy-analysis/` used to be an estimate written
 * by hand, and two of them were wrong by three orders of magnitude. The numbers
 * in that directory are now generated here instead, so a rebalance is a diff in
 * one file and the documentation can be regenerated rather than re-argued.
 *
 * The `current` model mirrors the live constants exactly. If you change
 * `PANEL_BASE_W`, `NETWORK_POWER_BASELINE`, the seed prices or the grid
 * expansion curve, update the CURRENT block below and re-run — the payback table
 * is the fastest way to see whether a change is survivable.
 */

/* ────────────────────────────  live constants  ─────────────────────────── */

/** Mirrors apps/api/prisma/seed.js and apps/api/src/config/mounts.js. */
const CURRENT = {
  panelBasePrice: 10,
  panelMultiplier: 1.15,
  mountSinglePrice: 15,
  mountDoublePrice: 45,
  panelWattsSingle: 1.0,
  panelWattsDouble: 1.25,
  baseline: 40, // env.NETWORK_POWER_BASELINE
  budgetPerCycle: 50, // miningPayout.js BUDGET_PER_NETWORK.solar
  cyclesPerDay: 144, // one cycle every 10 minutes
  gridCols: 14,
  gridDefaultRows: 4,
  gridMaxRows: 8,
  startingGrant: 50, // routes/auth.js STARTING_VLT
  minigameEV: 0.55, // services/minigameEngine.js loot table
  minigamePlaysPerDay: 45,
};

/** Candidate replacement model. See docs/economy-analysis/redesign-2026-07-28.md. */
const PROPOSED = {
  targetPaybackDays: 14,
  tierTax: 1.15, // cost per watt rises 15% per tier
  npcFloorAnchor: 0.6, // floor = 0.6 x (full default grid at frontier tier)
  poolPerCycle: 50,
  poolPopulationExponent: 0.85, // pool = K x N^0.85
  tiers: [
    { name: 'Mk1', watts: 1 },
    { name: 'Mk2', watts: 3 },
    { name: 'Mk3', watts: 9 },
    { name: 'Mk4', watts: 27 },
    { name: 'Mk5', watts: 81 },
  ],
};

/* ──────────────────────────────  helpers  ──────────────────────────────── */

const cells = (rows) => CURRENT.gridCols * rows;

/**
 * The live payout formula: a concave share of a fixed budget.
 * `share = rate / (rate + baseline) x budget`
 */
const dailyIncome = (rate, baseline = CURRENT.baseline, budget = CURRENT.budgetPerCycle) =>
  (rate / (rate + baseline)) * budget * CURRENT.cyclesPerDay;

/** Exponential price of the next panel when `owned` are already held. */
const panelPrice = (owned) =>
  CURRENT.panelBasePrice * Math.pow(CURRENT.panelMultiplier, owned);

/** Live grid expansion curve: 50000 x 4^(rows - 4). */
const expansionCost = (rows) => 50_000 * Math.pow(4, rows - CURRENT.gridDefaultRows);

const fmt = (n, dp = 0) =>
  Number(n).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });

const heading = (text) => console.log(`\n${'═'.repeat(78)}\n${text}\n${'═'.repeat(78)}`);

/* ───────────────────────────  current model  ───────────────────────────── */

function currentIncomeCurve() {
  heading('CURRENT — daily income vs power (100% allocated to solar)');
  console.log('panels |   W/s | VLT/day | % of nominal budget');
  for (const p of [1, 2, 5, 10, 20, 30, 40, 56, 70, 84, 98, 112]) {
    const rate = p * CURRENT.panelWattsDouble;
    const perDay = dailyIncome(rate);
    const ceiling = CURRENT.budgetPerCycle * CURRENT.cyclesPerDay;
    console.log(
      `${String(p).padStart(6)} | ${String(rate.toFixed(1)).padStart(5)} | ${fmt(perDay).padStart(7)} | ${(
        (perDay / ceiling) * 100
      ).toFixed(1)}%`
    );
  }
  console.log(
    `\nAsymptote: income can never exceed ${fmt(
      CURRENT.budgetPerCycle * CURRENT.cyclesPerDay
    )} VLT/day per player, no matter how much is built.`
  );
}

/**
 * Walks the cheapest path to a full grid.
 *
 * The first mount has to be a single: the 50 VLT grant does not cover a double
 * mount plus a panel (45 + 10 = 55), which is the first thing a new player
 * discovers. Everything after that is doubles, which are strictly better per
 * cell (1.25 W/s vs 1.00) and cells are the binding constraint.
 */
function currentProgression() {
  heading('CURRENT — measured progression to a full 56-cell grid');
  const marks = new Set([1, 2, 5, 10, 20, 30, 40, 50, 56]);
  let balance = CURRENT.startingGrant;
  let panels = 0;
  let days = 0;
  let spent = 0;

  console.log('panel |     day | unit price |   W/s | VLT/day | cumulative spend');
  while (panels < cells(CURRENT.gridDefaultRows)) {
    // A new mount is needed for panel 1 (single) and then every other panel.
    let mountCost = 0;
    if (panels === 0) mountCost = CURRENT.mountSinglePrice;
    else if ((panels - 1) % 2 === 1) mountCost = CURRENT.mountDoublePrice;

    const cost = panelPrice(panels) + mountCost;
    const rate = panels === 0 ? 0 : CURRENT.panelWattsSingle + (panels - 1) * CURRENT.panelWattsDouble;
    const perDay = dailyIncome(rate);

    if (balance >= cost) {
      balance -= cost;
      spent += cost;
      panels += 1;
      if (marks.has(panels)) {
        const newRate = CURRENT.panelWattsSingle + (panels - 1) * CURRENT.panelWattsDouble;
        console.log(
          `${String(panels).padStart(5)} | ${days.toFixed(2).padStart(7)} | ${fmt(
            panelPrice(panels - 1)
          ).padStart(10)} | ${newRate.toFixed(2).padStart(5)} | ${fmt(dailyIncome(newRate)).padStart(
            7
          )} | ${fmt(spent).padStart(16)}`
        );
      }
    } else {
      if (perDay <= 0) {
        console.log('  STALLED with no income — cannot progress.');
        break;
      }
      days += (cost - balance) / perDay;
      balance = cost;
    }
  }
  console.log(`\nFull default grid: ${days.toFixed(1)} days, ${fmt(spent)} VLT spent.`);
}

function currentPaybackDrift() {
  heading('CURRENT — marginal payback of the next panel (the ROI wall)');
  console.log('  next panel |        cost | added VLT/day | payback');
  const rows = [];
  for (const n of [1, 5, 10, 20, 30, 40, 50, 55, 70, 90, 111]) {
    const price = panelPrice(n);
    const delta =
      dailyIncome((n + 1) * CURRENT.panelWattsDouble) - dailyIncome(n * CURRENT.panelWattsDouble);
    const payback = price / delta;
    rows.push({ n: n + 1, price, delta, payback });
    console.log(
      `  ${String('#' + (n + 1)).padStart(10)} | ${price.toExponential(2).padStart(11)} | ${delta
        .toFixed(2)
        .padStart(13)} | ${
        payback < 1 ? (payback * 24).toFixed(1) + ' hours' : fmt(payback, 0) + ' days'
      }`
    );
  }
  const first = rows[0].payback;
  const last = rows.find((r) => r.n === 56 + 1) ?? rows[rows.length - 1];
  console.log(
    `\nPayback drift across the default grid: ${(
      (panelPrice(55) /
        (dailyIncome(56 * CURRENT.panelWattsDouble) - dailyIncome(55 * CURRENT.panelWattsDouble))) /
      first
    ).toExponential(2)}x — a wall, not a curve.`
  );

  // Where the exponent stops being representable or payable.
  const ceilingYear = CURRENT.budgetPerCycle * CURRENT.cyclesPerDay * 365;
  for (let n = 1; n < 400; n += 1) {
    if (panelPrice(n) > ceilingYear) {
      console.log(
        `Panel #${n} costs ${panelPrice(n).toExponential(
          2
        )} VLT — more than a full year at the income ceiling (${fmt(ceilingYear)}).`
      );
      break;
    }
  }
  for (let n = 1; n < 500; n += 1) {
    if (panelPrice(n) > 9e15) {
      console.log(`Panel #${n} costs ${panelPrice(n).toExponential(2)} VLT — exceeds JS safe integers.`);
      break;
    }
  }
}

function currentExpansionRoi() {
  heading('CURRENT — grid expansion return on investment');
  for (let rows = CURRENT.gridDefaultRows; rows < CURRENT.gridMaxRows; rows += 1) {
    const panelsNow = cells(rows);
    const panelsNext = cells(rows + 1);
    const before = dailyIncome(panelsNow * CURRENT.panelWattsDouble);
    const after = dailyIncome(panelsNext * CURRENT.panelWattsDouble);
    const delta = after - before;

    let fillCost = 7 * CURRENT.mountDoublePrice;
    for (let i = panelsNow; i < panelsNext; i += 1) fillCost += panelPrice(i);
    const total = expansionCost(rows) + fillCost;
    const fairPrice = delta * PROPOSED.targetPaybackDays;

    console.log(`\nrow ${rows + 1}: +${fmt(delta)} VLT/day (+${((delta / before) * 100).toFixed(1)}%)`);
    console.log(
      `  actual cost : ${total.toExponential(2)} VLT  (unlock ${fmt(
        expansionCost(rows)
      )} + panels ${fillCost.toExponential(2)})`
    );
    console.log(
      `  fair cost   : ${fmt(fairPrice)} VLT for a ${PROPOSED.targetPaybackDays}-day payback`
    );
    console.log(
      `  overpriced  : ${(total / fairPrice).toExponential(2)}x  →  real payback ${fmt(
        total / delta / 365
      )} YEARS`
    );
  }
}

function currentAggregateEmission() {
  heading('CURRENT — aggregate emission scales linearly with population');
  const perPlayer = dailyIncome(cells(CURRENT.gridDefaultRows) * CURRENT.panelWattsDouble);
  console.log(`Nominal budget: ${fmt(CURRENT.budgetPerCycle * CURRENT.cyclesPerDay)} VLT/day total.`);
  console.log('players | actual VLT/day minted | multiple of nominal');
  for (const n of [1, 10, 100, 1_000, 10_000]) {
    console.log(
      `${String(fmt(n)).padStart(7)} | ${fmt(perPlayer * n).padStart(21)} | ${fmt(
        (perPlayer * n) / (CURRENT.budgetPerCycle * CURRENT.cyclesPerDay),
        1
      )}x`
    );
  }
  console.log('\nThe "budget" is a per-player asymptote, not a pool. There is no global cap.');
}

function currentMinigameRelevance() {
  heading('CURRENT — minigame contribution');
  const perDay = CURRENT.minigameEV * CURRENT.minigamePlaysPerDay;
  const early = dailyIncome(5 * CURRENT.panelWattsDouble);
  const late = dailyIncome(cells(CURRENT.gridDefaultRows) * CURRENT.panelWattsDouble);
  console.log(
    `EV ${CURRENT.minigameEV} VLT/play x ${CURRENT.minigamePlaysPerDay} plays = ${fmt(perDay, 1)} VLT/day`
  );
  console.log(`  vs 5-panel farm  (${fmt(early)} VLT/day): ${((perDay / early) * 100).toFixed(1)}%`);
  console.log(`  vs full grid     (${fmt(late)} VLT/day): ${((perDay / late) * 100).toFixed(2)}%`);
  console.log('\nActive play is worth under 1% of idle income. Rational players stop.');
}

/* ───────────────────────────  proposed model  ──────────────────────────── */

/**
 * Under the proposed model a player's difficulty is the rest of the network:
 *
 *   D_i     = sum of every other player's watts + npcFloor
 *   share_i = r_i / (r_i + D_i) x pool
 *
 * which is algebraically the proportional split `r_i / (sum(r) + floor) x pool`,
 * so total emission is capped at `pool` however many players there are. The NPC
 * floor is anchored to the frontier tier so a solo player still sees a curve.
 */
function proposedPricing() {
  heading('PROPOSED — prices derived from a target ROI, per season');
  console.log(
    `Pool ${PROPOSED.poolPerCycle} VLT/cycle (SHARED) · target payback ${PROPOSED.targetPaybackDays} days · tier tax ${(
      (PROPOSED.tierTax - 1) *
      100
    ).toFixed(0)}%/tier\n`
  );

  const poolDay = PROPOSED.poolPerCycle * CURRENT.cyclesPerDay;
  const defaultCells = cells(CURRENT.gridDefaultRows);

  for (let frontier = 0; frontier < PROPOSED.tiers.length; frontier += 1) {
    const floor = PROPOSED.npcFloorAnchor * defaultCells * PROPOSED.tiers[frontier].watts;
    // Reference network: a median farm sitting at half the frontier's full build.
    const median = (defaultCells * PROPOSED.tiers[frontier].watts) / 2;
    const yieldPerWatt =
      dailyIncome(median + 1, floor, PROPOSED.poolPerCycle) -
      dailyIncome(median, floor, PROPOSED.poolPerCycle);

    console.log(
      `── Season ${frontier + 1} · frontier ${PROPOSED.tiers[frontier].name} · difficulty ${fmt(floor)} W/s`
    );
    console.log('   tier | W/cell | price/panel | VLT/W | full farm | VLT/day | % pool | farm payback');
    for (let i = 0; i <= frontier; i += 1) {
      const tier = PROPOSED.tiers[i];
      const price = yieldPerWatt * tier.watts * PROPOSED.targetPaybackDays * Math.pow(PROPOSED.tierTax, i);
      const full = defaultCells * tier.watts;
      const income = dailyIncome(full, floor, PROPOSED.poolPerCycle);
      console.log(
        `   ${tier.name.padEnd(4)} | ${String(tier.watts).padStart(6)} | ${fmt(price).padStart(11)} | ${fmt(
          price / tier.watts,
          1
        ).padStart(5)} | ${String(fmt(full)).padStart(9)} | ${fmt(income).padStart(7)} | ${(
          (income / poolDay) *
          100
        )
          .toFixed(1)
          .padStart(5)}% | ${(((price * defaultCells) / income)).toFixed(1).padStart(5)} days`
      );
    }
    console.log('');
  }
}

function proposedObsolescence() {
  heading('PROPOSED — automatic obsolescence (no manual nerf required)');
  const defaultCells = cells(CURRENT.gridDefaultRows);
  const poolDay = PROPOSED.poolPerCycle * CURRENT.cyclesPerDay;
  console.log('A player who never upgrades past Mk1, as each new tier ships:');
  for (const [i, tier] of PROPOSED.tiers.entries()) {
    const floor = PROPOSED.npcFloorAnchor * defaultCells * tier.watts;
    const income = dailyIncome(defaultCells * 1, floor, PROPOSED.poolPerCycle);
    console.log(
      `  frontier ${tier.name}: ${fmt(income).padStart(5)} VLT/day (${((income / poolDay) * 100)
        .toFixed(1)
        .padStart(4)}% of pool)`
    );
  }
  console.log('\nIncome decays on its own as the frontier advances — upgrade pressure without a patch note.');
}

function proposedPopulationScaling() {
  heading('PROPOSED — sublinear pool keeps emission bounded and latecomers viable');
  const K = 2_817; // calibrated so N=1000 pays ~1000 VLT/day per average player
  const currentPerPlayer = dailyIncome(cells(CURRENT.gridDefaultRows) * CURRENT.panelWattsDouble);
  console.log('players | current total | proposed total | current/player | proposed/player');
  for (const n of [1, 10, 100, 1_000, 10_000]) {
    const proposedTotal = K * Math.pow(n, PROPOSED.poolPopulationExponent);
    console.log(
      `${String(fmt(n)).padStart(7)} | ${fmt(currentPerPlayer * n).padStart(13)} | ${fmt(
        proposedTotal
      ).padStart(14)} | ${fmt(currentPerPlayer).padStart(14)} | ${fmt(proposedTotal / n).padStart(15)}`
    );
  }
  console.log(
    `\nDoubling the population costs each player ~${(
      (1 - Math.pow(2, PROPOSED.poolPopulationExponent - 1)) *
      100
    ).toFixed(0)}% of income — a ramp, not a cliff.`
  );
}

function proposedSinkSizing() {
  heading('PROPOSED — recurring sink sizing (upkeep as % of gross income)');
  const defaultCells = cells(CURRENT.gridDefaultRows);
  const floor = PROPOSED.npcFloorAnchor * defaultCells * 9;
  const gross = dailyIncome(defaultCells * 9, floor, PROPOSED.poolPerCycle);
  console.log(`Reference: full Mk3 farm, gross ${fmt(gross)} VLT/day\n`);
  console.log('  upkeep | drain/day | net/day | effective payback multiplier');
  for (const pct of [0.05, 0.1, 0.2, 0.3]) {
    console.log(
      `  ${((pct * 100).toFixed(0) + '%').padStart(6)} | ${fmt(gross * pct).padStart(9)} | ${fmt(
        gross * (1 - pct)
      ).padStart(7)} | ${(1 / (1 - pct)).toFixed(2)}x`
    );
  }
  console.log('\n20% is the recommended starting point: it is felt without being punitive.');
}

/* ────────────────────────────────  main  ───────────────────────────────── */

const model = process.argv.find((a) => a.startsWith('--model='))?.split('=')[1] ?? 'both';

if (model === 'current' || model === 'both') {
  currentIncomeCurve();
  currentProgression();
  currentPaybackDrift();
  currentExpansionRoi();
  currentAggregateEmission();
  currentMinigameRelevance();
}

if (model === 'proposed' || model === 'both') {
  proposedPricing();
  proposedObsolescence();
  proposedPopulationScaling();
  proposedSinkSizing();
}

console.log('');
