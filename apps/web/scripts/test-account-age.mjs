#!/usr/bin/env node
/**
 * Unit checks for `src/lib/accountAge.js`.
 *
 * Calendar arithmetic is easy to get subtly wrong — month-end borrowing and
 * leap years are the usual suspects — and wrong output here is the kind of bug
 * that only shows up months after release, on one specific signup date.
 *
 * `accountAge.js` imports nothing, so this runs with plain Node: no bundler, no
 * dependencies, no browser.
 *
 * Usage (from the repository root):
 *
 *   node apps/web/scripts/test-account-age.mjs
 */

import { formatAccountAge, calendarDiff, nextAgeRefreshMs } from '../src/lib/accountAge.js';

let passed = 0;
const failures = [];

/** Local-time date, matching how calendarDiff reads its fields. */
function at(year, month, day, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function expectAge(label, created, now, expected) {
  const actual = formatAccountAge(created, now);
  if (actual === expected) passed += 1;
  else failures.push({ label, detail: `expected "${expected}", got "${actual}"` });
}

function expect(label, actual, expected) {
  if (actual === expected) passed += 1;
  else failures.push({ label, detail: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
}

/* ── Sub-minute and minutes ──────────────────────────────────────── */

expectAge('same instant', at(2026, 7, 26, 12, 0), at(2026, 7, 26, 12, 0), 'menos de 1 minuto');
expectAge('one minute', at(2026, 7, 26, 12, 0), at(2026, 7, 26, 12, 1), '1 minuto');
expectAge('forty minutes', at(2026, 7, 26, 12, 0), at(2026, 7, 26, 12, 40), '40 minutos');

// Server/browser clock skew can put creation in the future; a negative age
// would be worse than clamping.
expectAge(
  'creation in the future clamps',
  at(2026, 7, 26, 13, 0),
  at(2026, 7, 26, 12, 0),
  'menos de 1 minuto'
);

/* ── Hours ───────────────────────────────────────────────────────── */

expectAge('one hour', at(2026, 7, 26, 12, 0), at(2026, 7, 26, 13, 0), '1 hora');
expectAge('five hours', at(2026, 7, 26, 8, 0), at(2026, 7, 26, 13, 30), '5 horas');
expectAge('23 hours stays hours', at(2026, 7, 25, 14, 0), at(2026, 7, 26, 13, 0), '23 horas');

/* ── Days, with hours ────────────────────────────────────────────── */

expectAge('exactly one day', at(2026, 7, 25, 12, 0), at(2026, 7, 26, 12, 0), '1 dia');
expectAge('one day and one hour', at(2026, 7, 25, 12, 0), at(2026, 7, 26, 13, 0), '1 dia, 1 hora');

// The shape from the original request.
expectAge('seven days and 21 hours', at(2026, 7, 18, 15, 0), at(2026, 7, 26, 12, 0), '7 dias, 21 horas');

// "7 dias, 0 horas" reads worse than "7 dias".
expectAge('zero hours are omitted', at(2026, 7, 19, 12, 0), at(2026, 7, 26, 12, 0), '7 dias');

expectAge('30 days is still days', at(2026, 7, 1, 12, 0), at(2026, 7, 31, 12, 0), '30 dias');

/* ── Months: coarse only ─────────────────────────────────────────── */

expectAge('exactly one month', at(2026, 6, 26, 12, 0), at(2026, 7, 26, 12, 0), '1 mês');

// One hour short of a month must not round up. June has 30 days, so 30 days
// after 26 Jun 13:00 is 26 Jul 13:00 — an hour later than `now`, leaving
// 29 days and 23 hours. (An earlier version of this test expected 30 days,
// which was the test being wrong, not the code.)
expectAge(
  'one hour before a month',
  at(2026, 6, 26, 13, 0),
  at(2026, 7, 26, 12, 0),
  '29 dias, 23 horas'
);

expectAge('four months drops days and hours', at(2026, 3, 19, 15, 0), at(2026, 7, 26, 12, 0), '4 meses');
expectAge('eleven months', at(2025, 8, 26, 12, 0), at(2026, 7, 26, 12, 0), '11 meses');

/* ── Years: coarse only ──────────────────────────────────────────── */

expectAge('exactly one year', at(2025, 7, 26, 12, 0), at(2026, 7, 26, 12, 0), '1 ano');
expectAge('one year eleven months is still 1 ano', at(2024, 8, 26, 12, 0), at(2026, 7, 26, 12, 0), '1 ano');
expectAge('two years', at(2024, 7, 26, 12, 0), at(2026, 7, 26, 12, 0), '2 anos');

// A day short of a year must report months, not "1 ano".
expectAge('one day before a year', at(2025, 7, 27, 12, 0), at(2026, 7, 26, 12, 0), '11 meses');

/* ── Calendar edge cases ─────────────────────────────────────────── */

// The case a 30-day-month approximation gets wrong: 31 Jan to 2 Mar is NOT a
// month plus two days in a non-leap year — February has 28 days.
expect(
  '31 Jan to 2 Mar 2027 borrows February correctly',
  calendarDiff(at(2027, 1, 31), at(2027, 3, 2)).days,
  2
);
expect(
  '31 Jan to 2 Mar 2027 is one month',
  calendarDiff(at(2027, 1, 31), at(2027, 3, 2)).totalMonths,
  1
);

// Leap year: 2028 February has 29 days.
expect(
  '31 Jan to 1 Mar 2028 accounts for the leap day',
  calendarDiff(at(2028, 1, 31), at(2028, 3, 1)).days,
  1
);

// Crossing the year boundary must borrow into years, not produce negatives.
expect(
  '15 Dec to 10 Jan borrows across the year',
  calendarDiff(at(2025, 12, 15), at(2026, 1, 10)).months,
  0
);
expectAge('crossing new year', at(2025, 12, 15, 12, 0), at(2026, 1, 10, 12, 0), '26 dias');

// Every field of a borrowed diff must be non-negative.
const borrowed = calendarDiff(at(2026, 3, 31, 23, 59), at(2026, 4, 1, 0, 0));
expect(
  'no negative fields after borrowing',
  Object.values(borrowed).every((v) => v >= 0),
  true
);

/* ── Missing input ───────────────────────────────────────────────── */

expect('null createdAt', formatAccountAge(null), null);
expect('undefined createdAt', formatAccountAge(undefined), null);
expect('garbage string', formatAccountAge('not a date'), null);
expect('ISO string is accepted', typeof formatAccountAge(new Date().toISOString()), 'string');

/* ── Refresh scheduling ──────────────────────────────────────────── */

expect(
  'fresh account ticks every 30s',
  nextAgeRefreshMs(at(2026, 7, 26, 11, 0), at(2026, 7, 26, 12, 0)),
  30_000
);
expect(
  'week-old account ticks every 5min',
  nextAgeRefreshMs(at(2026, 7, 19, 12, 0), at(2026, 7, 26, 12, 0)),
  5 * 60_000
);
expect(
  'months-old account does not tick',
  nextAgeRefreshMs(at(2026, 1, 26, 12, 0), at(2026, 7, 26, 12, 0)),
  null
);
expect('no createdAt does not tick', nextAgeRefreshMs(null), null);

/* ── Report ──────────────────────────────────────────────────────── */

const total = passed + failures.length;

if (failures.length === 0) {
  console.log(`[account-age] ${passed}/${total} checks passed`);
} else {
  console.error(`[account-age] ${passed}/${total} passed, ${failures.length} FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure.label}\n      ${failure.detail}`);
  process.exitCode = 1;
}
