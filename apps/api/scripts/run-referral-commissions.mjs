#!/usr/bin/env node
/**
 * Settles referral commissions for one day, instead of waiting for the 00:15 UTC
 * cron.
 *
 * The main thing worth verifying with this script is that settlement is
 * *idempotent*: run it twice for the same day and the second run must credit
 * nothing. That property is what protects players from being paid twice when a
 * deployment interrupts the cron, and it is enforced by a unique index rather
 * than by application bookkeeping, so it is worth confirming for real.
 *
 * Usage (from apps/api, so the .env is picked up):
 *
 *   node scripts/run-referral-commissions.mjs              # settle yesterday
 *   node scripts/run-referral-commissions.mjs 2026-07-27   # settle a given UTC day
 *   node scripts/run-referral-commissions.mjs --twice      # prove idempotency
 *
 * Writes to the database: credits balances, inserts ReferralCommission and
 * LedgerEntry rows.
 */

import 'dotenv/config';

import prisma from '../src/lib/prisma.js';
import { runCommissionCycle, previousUtcDay } from '../src/services/referralCommissions.js';
import env from '../src/config/env.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const args = process.argv.slice(2);
const twice = args.includes('--twice');
const dayArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

/** Parses a YYYY-MM-DD argument as midnight UTC. */
function parseDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Not a valid date: ${value}`);
  }
  return date;
}

async function describeSetup() {
  console.log(`\n${c.bold}${c.cyan}Configuration${c.reset}`);
  console.log(`  mining commission:   ${(env.REFERRAL_MINING_RATE * 100).toFixed(2)}%`);
  console.log(`  purchase commission: ${(env.REFERRAL_PURCHASE_RATE * 100).toFixed(2)}%`);

  if (env.REFERRAL_MINING_RATE <= 0 && env.REFERRAL_PURCHASE_RATE <= 0) {
    console.log(`  ${c.yellow}both rates are 0 — settlement will do nothing${c.reset}`);
  }

  const referredCount = await prisma.user.count({ where: { referredById: { not: null } } });
  console.log(`\n${c.bold}${c.cyan}Referral graph${c.reset}`);
  console.log(`  attributed accounts: ${referredCount}`);

  if (referredCount === 0) {
    console.log(
      `  ${c.yellow}Nobody has been referred yet, so there is nothing to settle.${c.reset}\n` +
        `  ${c.dim}Sign up a second account through /login?r=CODE to create a pair.${c.reset}`
    );
  }

  // Mining commissions depend on the payout cron having produced rows. It
  // currently pays nobody without a MiningAllocation, so say so rather than
  // letting a zero total look like a bug in settlement.
  const payoutCount = await prisma.playerPayout.count();
  if (payoutCount === 0 && env.REFERRAL_MINING_RATE > 0) {
    console.log(
      `  ${c.yellow}No PlayerPayout rows exist${c.reset} — mining commissions will be 0 ` +
        `until the payout cycle produces some.`
    );
  }
}

async function settle(periodDate, label) {
  console.log(`\n${c.bold}${c.cyan}${label}${c.reset}`);

  const started = Date.now();
  const summary = await runCommissionCycle(periodDate ? { periodDate } : {});
  const elapsed = Date.now() - started;

  console.log(`  day settled:  ${summary.periodDate}`);
  console.log(`  pairs walked: ${summary.pairs}`);
  console.log(`  credited:     ${summary.credited}`);
  console.log(`  skipped:      ${summary.skipped} ${c.dim}(zero activity or already settled)${c.reset}`);
  console.log(`  failed:       ${summary.failed}`);
  console.log(`  total paid:   ${summary.total.toFixed(4)} VLT`);
  console.log(`  ${c.dim}completed in ${elapsed}ms${c.reset}`);

  return summary;
}

async function main() {
  console.log(`${c.bold}WattFarm — referral commission settlement${c.reset}`);

  await describeSetup();

  const periodDate = dayArg ? parseDay(dayArg) : previousUtcDay().start;

  const first = await settle(periodDate, 'First run');

  if (!twice) {
    if (first.credited > 0) {
      const rows = await prisma.referralCommission.findMany({
        where: { periodDate },
        orderBy: { createdAt: 'desc' },
        take: first.credited,
      });

      console.log(`\n${c.bold}${c.cyan}Credited${c.reset}`);
      for (const row of rows) {
        console.log(
          `  ${row.referrerId.slice(0, 8)}… ← ${row.referredId.slice(0, 8)}…  ` +
            `${row.kind.padEnd(8)} ${String(row.sourceAmount)} x ${row.rate} = ` +
            `+${String(row.amount)} VLT`
        );
      }
    }

    console.log(
      `\n  ${c.dim}Re-run with --twice to confirm a repeat settlement pays nothing.${c.reset}`
    );
    return;
  }

  const second = await settle(periodDate, 'Second run (same day)');

  console.log(`\n${c.bold}${c.cyan}Idempotency${c.reset}`);
  if (second.credited === 0) {
    console.log(
      `  ${c.green}PASS${c.reset} — the repeat run credited nothing ` +
        `(${second.skipped} skipped as already settled).`
    );
  } else {
    console.log(
      `  ${c.red}FAIL${c.reset} — the repeat run credited ${second.credited} commission(s) ` +
        `worth ${second.total.toFixed(4)} VLT. The unique index on ` +
        `(referrerId, referredId, kind, periodDate) is not doing its job.`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`\n${c.red}Settlement run failed: ${err.stack || err.message}${c.reset}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
