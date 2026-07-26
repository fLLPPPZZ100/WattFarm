/**
 * Referral programme — pure-logic checks.
 *
 * Unlike `test-concurrency.mjs`, this needs no running API and no database: it
 * exercises the tier ladder and the invite-code parser directly. Those are the
 * two places where a quiet mistake costs real money — a wrong tier boundary
 * overpays every commission, and a parser that drops a valid code silently
 * denies someone their referral.
 *
 * Run with:  node apps/api/scripts/test-referral.mjs
 */

import {
  levelFor,
  publicConfig,
  CODE_ALPHABET,
  CODE_LENGTH,
  REFERRAL_LEVELS,
  QUALIFYING_POWER_RATE,
  SIGNUP_BONUS_VLT,
} from '../src/config/referral.js';
import { generateCode, normaliseCode, maskEmail } from '../src/lib/referralCode.js';

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  const detail = ok ? '' : `  (expected ${JSON.stringify(expected)})`;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${JSON.stringify(actual)}${detail}`);
}

function section(title) {
  console.log(`\n${title}`);
}

console.log('WattFarm — referral logic checks');

/* ── Tier ladder ── */

section('1. Tier boundaries');
for (const tier of REFERRAL_LEVELS) {
  check(`${tier.pointsRequired} pts is level ${tier.level}`, levelFor(tier.pointsRequired).level, tier.level);

  if (tier.pointsRequired > 0) {
    const below = REFERRAL_LEVELS.find((candidate) => candidate.level === tier.level - 1);
    check(
      `${tier.pointsRequired - 1} pts is still level ${below.level}`,
      levelFor(tier.pointsRequired - 1).level,
      below.level
    );
  }
}

section('2. Degenerate point totals do not escalate the tier');
check('negative', levelFor(-5).level, 1);
check('NaN', levelFor(NaN).level, 1);
check('undefined', levelFor(undefined).level, 1);
check('fractional truncates down', levelFor(1.9).level, 1);
check('absurdly high caps at the top tier', levelFor(1e9).level, REFERRAL_LEVELS.at(-1).level);
check('top tier reports no next tier', levelFor(1e9).next, null);

section('3. Rates are bounded and increasing');
check('lowest rate', levelFor(0).commissionRate, 0.1);
check('highest rate', levelFor(1e9).commissionRate, 0.25);
let previousRate = 0;
let monotonic = true;
for (const tier of REFERRAL_LEVELS) {
  if (tier.level > 1 && tier.commissionRate <= previousRate) monotonic = false;
  previousRate = tier.commissionRate;
}
check('every tier pays more than the one below', monotonic, true);

/* ── Code generation ── */

section('4. Generated codes');
const generated = new Set();
let outsideAlphabet = null;
let wrongLength = null;
for (let i = 0; i < 5000; i += 1) {
  const code = generateCode();
  if (code.length !== CODE_LENGTH) wrongLength = code.length;
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) outsideAlphabet = char;
  }
  generated.add(code);
}
check('all are the configured length', wrongLength, null);
check('no character outside the alphabet', outsideAlphabet, null);
check('5000 codes with no collision', generated.size, 5000);
check('no ambiguous I/L/O/U', /[ILOU]/.test([...generated].join('')), false);

let roundTripFailures = 0;
for (const code of [...generated].slice(0, 500)) {
  if (normaliseCode(code) !== code) roundTripFailures += 1;
}
check('generated codes normalise to themselves', roundTripFailures, 0);

/* ── Code parsing ── */

section('5. Input a player might actually paste');
check('lowercase', normaliseCode('abcd1234'), 'ABCD1234');
check('surrounding whitespace', normaliseCode('  ABCD1234  '), 'ABCD1234');
check('hyphenated', normaliseCode('ABCD-1234'), 'ABCD1234');
check('internal space', normaliseCode('ABCD 1234'), 'ABCD1234');
check('full invite link', normaliseCode('https://wattfarm.app/?ref=ABCD1234'), 'ABCD1234');
check('link with fragment', normaliseCode('https://wattfarm.app/?ref=ABCD1234#top'), 'ABCD1234');
check('ref after another param', normaliseCode('https://x.app/?utm=fb&ref=ABCD1234'), 'ABCD1234');
check('ref before another param', normaliseCode('https://x.app/?ref=ABCD1234&utm=fb'), 'ABCD1234');
check('referral= spelling', normaliseCode('https://x.app/?referral=ABCD1234'), 'ABCD1234');
check('r= spelling', normaliseCode('https://x.app/?r=ABCD1234'), 'ABCD1234');
check('query only', normaliseCode('?ref=abcd1234'), 'ABCD1234');
check('named param beats a lookalike host', normaliseCode('https://ABCDEFGH.app/?ref=ZZZZ9999'), 'ZZZZ9999');
check('path-style link', normaliseCode('https://x.io/invite/ABCD1234'), 'ABCD1234');
check('path-style link with fragment', normaliseCode('https://x.io/invite/ABCD1234#go'), 'ABCD1234');

section('6. Input that must be refused');
check('empty', normaliseCode(''), null);
check('null', normaliseCode(null), null);
check('number', normaliseCode(12345678), null);
check('object', normaliseCode({}), null);
check('too short', normaliseCode('ABC123'), null);
check('too long', normaliseCode('ABCD12345'), null);
check('no valid characters', normaliseCode('!!!!!!!!'), null);
check('oversized string', normaliseCode('A'.repeat(10000)), null);
check('only ambiguous characters', normaliseCode('ILOUILOU'), null);

/* ── Email masking ── */

section('7. Referral list masks emails');
check('typical address', maskEmail('felipecosta@gmail.com'), 'fe*********@gmail.com');
check('two-character local part is padded', maskEmail('ab@x.com'), 'ab***@x.com');
check('one-character local part', maskEmail('a@x.com'), 'a***@x.com');
check('plus addressing', maskEmail('joao+tag@dominio.com.br'), 'jo******@dominio.com.br');
check('domain is preserved', maskEmail('x@a.io')?.endsWith('@a.io'), true);
check('not an email', maskEmail('notanemail'), null);
check('trailing @', maskEmail('user@'), null);
check('leading @', maskEmail('@domain.com'), null);
check('null', maskEmail(null), null);

/* ── Reference table ── */

section('8. Config exposed to the client');
const exposed = publicConfig();
check('all tiers are published', exposed.levels.length, REFERRAL_LEVELS.length);
check('signup bonus is published', exposed.signupBonus, SIGNUP_BONUS_VLT);
check('qualification threshold is published', exposed.qualifyingPowerRate, QUALIFYING_POWER_RATE);
check('published config is JSON-safe', typeof JSON.stringify(exposed), 'string');

section('9. What a commission actually pays');
// The cycle budget lives in services/networkPower.js, which pulls in Prisma;
// restated here so this script stays database-free.
const CYCLE_BUDGET = 50;
console.log(`  Reference: a player taking the whole ${CYCLE_BUDGET} VLT cycle budget.`);
for (const tier of REFERRAL_LEVELS) {
  const percent = (tier.commissionRate * 100).toFixed(0);
  console.log(
    `  level ${tier.level}  ${String(tier.pointsRequired).padStart(2)} pts  ` +
      `${percent.padStart(2)}%  ->  ${(CYCLE_BUDGET * tier.commissionRate).toFixed(4)} VLT ` +
      'per referral payout'
  );
}
console.log(`  Referrals qualify at ${QUALIFYING_POWER_RATE} W/s installed.`);
console.log(`  Joining through an invite grants the new player ${SIGNUP_BONUS_VLT} VLT.`);

section('Result');
if (failures === 0) {
  console.log('  All checks passed.');
} else {
  console.log(`  ${failures} check(s) failed.`);
}

process.exit(failures === 0 ? 0 : 1);
