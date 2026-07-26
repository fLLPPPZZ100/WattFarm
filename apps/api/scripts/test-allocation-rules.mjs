#!/usr/bin/env node
/**
 * Unit checks for `services/allocationRules.js`.
 *
 * `POST /api/mining/allocations` decides how much of a player's power is pointed
 * at each network, and therefore their income, so its validation is an anti-cheat
 * boundary. This exercises that validation directly.
 *
 * Needs no database, no server and no dependencies — `allocationRules.js`
 * imports nothing — so unlike `test-concurrency.mjs` it can run anywhere,
 * including in CI before any infrastructure exists.
 *
 * Usage (from the repository root):
 *
 *   node apps/api/scripts/test-allocation-rules.mjs
 *
 * Exits non-zero on the first failing expectation set, so it can gate a build.
 */

import { validateAllocations, VALID_NETWORKS } from '../src/services/allocationRules.js';

let passed = 0;
const failures = [];

/**
 * @param {string} label what the case demonstrates
 * @param {unknown} input value passed to validateAllocations
 * @param {(result: object) => boolean} expectation
 */
function check(label, input, expectation) {
  let result;
  try {
    result = validateAllocations(input);
  } catch (err) {
    failures.push({ label, detail: `threw: ${err.message}` });
    return;
  }

  if (expectation(result)) passed += 1;
  else failures.push({ label, detail: `got ${JSON.stringify(result)}` });
}

const accepted = (result) => result.problems.length === 0;
const rejectedWith = (fragment) => (result) =>
  result.problems.length > 0 && result.problems.some((p) => p.includes(fragment));

/* ── Accepted input ──────────────────────────────────────────────── */

check('everything on one network', [{ network: 'solar', percentage: 100 }], accepted);

check(
  'split across all three networks',
  [
    { network: 'solar', percentage: 50 },
    { network: 'wind', percentage: 30 },
    { network: 'hydro', percentage: 20 },
  ],
  accepted
);

// Sliders emit floats, so thirds have to be tolerated.
check(
  'float slop within tolerance',
  [
    { network: 'solar', percentage: 33.33 },
    { network: 'wind', percentage: 33.33 },
    { network: 'hydro', percentage: 33.34 },
  ],
  accepted
);

// The normalised set is what gets persisted, so it must not carry anything the
// client put in the payload — `userId` above all.
check(
  'normalised output keeps only network and percentage',
  [{ network: 'solar', percentage: 100, userId: 'someone-else', id: 'forged' }],
  (result) =>
    result.problems.length === 0 &&
    result.allocations.length === 1 &&
    Object.keys(result.allocations[0]).sort().join(',') === 'network,percentage'
);

/* ── Malformed containers ────────────────────────────────────────── */

check('not an array', { solar: 100 }, rejectedWith('must be an array'));
check('null', null, rejectedWith('must be an array'));
check('undefined', undefined, rejectedWith('must be an array'));
check('empty array', [], rejectedWith('at least one entry'));

check(
  'more entries than there are networks',
  [
    { network: 'solar', percentage: 25 },
    { network: 'wind', percentage: 25 },
    { network: 'hydro', percentage: 25 },
    { network: 'solar', percentage: 25 },
  ],
  rejectedWith(`at most ${VALID_NETWORKS.length}`)
);

/* ── Bad values ──────────────────────────────────────────────────── */

check('sum below 100', [{ network: 'solar', percentage: 99 }], rejectedWith('sum to 100'));

check(
  'sum above 100',
  [
    { network: 'solar', percentage: 60 },
    { network: 'wind', percentage: 60 },
  ],
  rejectedWith('sum to 100')
);

check('unknown network', [{ network: 'nuclear', percentage: 100 }], rejectedWith('unknown network'));
check('network missing entirely', [{ percentage: 100 }], rejectedWith('unknown network'));
check('entry is null', [null], rejectedWith('unknown network'));

check(
  'duplicate network',
  [
    { network: 'solar', percentage: 50 },
    { network: 'solar', percentage: 50 },
  ],
  rejectedWith('duplicate entry')
);

// A string or null would coerce during addition and let a nonsense payload
// satisfy the sum, so the type check has to come before any arithmetic.
check('percentage as string', [{ network: 'solar', percentage: '100' }], rejectedWith('finite number'));
check('percentage null', [{ network: 'solar', percentage: null }], rejectedWith('finite number'));
check('percentage NaN', [{ network: 'solar', percentage: NaN }], rejectedWith('finite number'));
check('percentage Infinity', [{ network: 'solar', percentage: Infinity }], rejectedWith('finite number'));

/* ── Ordering ────────────────────────────────────────────────────── */

/**
 * These are the cases the reordering was for. The old implementation checked the
 * sum before checking each value, so any payload that was both out of range and
 * off 100 was reported as a sum problem — accurate but useless, since it pointed
 * the player at the total instead of at the offending slider.
 *
 * Note that a payload of 150/-50 was NOT affected: it sums to exactly 100, so
 * the old code fell through to the range check and reported it correctly. Only
 * the combination of a bad value AND a bad sum was mis-reported.
 */
check(
  'out-of-range values summing to 90 report the range, not the sum',
  [
    { network: 'solar', percentage: 150 },
    { network: 'wind', percentage: -60 },
  ],
  (result) =>
    result.problems.some((p) => p.includes('between 0 and 100')) &&
    !result.problems.some((p) => p.includes('sum to 100'))
);

check(
  'negative percentage is reported as a range problem',
  [
    { network: 'solar', percentage: -10 },
    { network: 'wind', percentage: 60 },
  ],
  rejectedWith('between 0 and 100')
);

check(
  'unknown network with a wrong sum reports the network, not the sum',
  [{ network: 'nuclear', percentage: 90 }],
  (result) =>
    result.problems.some((p) => p.includes('unknown network')) &&
    !result.problems.some((p) => p.includes('sum to 100'))
);

// Every entry is inspected, so a player fixing a form sees all of it at once
// rather than one problem per submit.
check(
  'all per-entry problems are collected',
  [
    { network: 'nuclear', percentage: 50 },
    { network: 'solar', percentage: 'x' },
  ],
  (result) => result.problems.length === 2
);

/* ── Report ──────────────────────────────────────────────────────── */

const total = passed + failures.length;

if (failures.length === 0) {
  console.log(`[allocation-rules] ${passed}/${total} checks passed`);
} else {
  console.error(`[allocation-rules] ${passed}/${total} passed, ${failures.length} FAILED:\n`);
  for (const failure of failures) {
    console.error(`  - ${failure.label}\n      ${failure.detail}`);
  }
  process.exitCode = 1;
}
