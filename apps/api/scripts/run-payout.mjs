#!/usr/bin/env node
/**
 * Runs one mining payout cycle immediately, instead of waiting for the cron.
 *
 * Useful for verifying the payout path end to end: that power comes from what
 * is placed, that the synthetic network baseline produces a partial share
 * instead of the whole budget, and that `payout.amount` reaches the client as a
 * JSON number rather than a Decimal-serialised string.
 *
 * Usage (from apps/api, so the .env is picked up):
 *
 *   node scripts/run-payout.mjs
 *   node scripts/run-payout.mjs --explain    # show why players were skipped
 *
 * Writes to the database: credits balances and inserts PlayerPayout rows.
 */

import 'dotenv/config';

import prisma from '../src/lib/prisma.js';
import { runPayoutCycle } from '../src/services/miningPayout.js';
import { computePowerRate, computeShare } from '../src/services/powerCalculator.js';
import env from '../src/config/env.js';

const explain = process.argv.includes('--explain');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

/**
 * Explains whether anyone is eligible to be paid.
 *
 * A payout produces nothing unless a player has panels actually installed on
 * mounts. Owning panels is not enough — that is the whole point of the placement
 * model — and without this report a cycle that pays nothing just looks broken.
 */
async function describeEligibility() {
  console.log(`\n${c.bold}${c.cyan}Eligibility${c.reset}`);
  console.log(`  ${c.dim}network baseline: ${env.NETWORK_POWER_BASELINE} W/s${c.reset}`);

  const placed = await prisma.placedMount.findMany({
    select: { userId: true, type: true, panels: true },
  });

  if (placed.length === 0) {
    console.log(`  ${c.yellow}nobody has placed a mount yet — nothing to pay${c.reset}`);
    return;
  }

  const byUser = new Map();
  for (const mount of placed) {
    const mounts = byUser.get(mount.userId);
    if (mounts) mounts.push(mount);
    else byUser.set(mount.userId, [mount]);
  }

  let eligible = 0;

  for (const [userId, mounts] of byUser) {
    const rate = computePowerRate(mounts);

    if (rate <= 0) {
      if (explain) {
        const owned = await prisma.playerAsset.findMany({ where: { userId } });
        const panels = owned.find((a) => a.type === 'solar')?.quantity ?? 0;
        console.log(
          `  ${c.dim}user ${userId.slice(0, 8)}… ${mounts.length} mount(s) placed, 0 W/s` +
            (panels > 0 ? ` — owns ${panels} panel(s) but none installed on a mount` : '') +
            `${c.reset}`
        );
      }
      continue;
    }

    eligible += 1;

    if (explain) {
      const share = computeShare(rate, env.NETWORK_POWER_BASELINE, 50);
      const pct = (rate / (rate + env.NETWORK_POWER_BASELINE)) * 100;
      console.log(
        `  ${c.dim}user ${userId.slice(0, 8)}… ${rate} W/s placed = ` +
          `${pct.toFixed(1)}% of the network → ${share.toFixed(2)} VLT${c.reset}`
      );
    }
  }

  const colour = eligible > 0 ? c.green : c.yellow;
  console.log(`  ${colour}${byUser.size} player(s) with mounts, ${eligible} eligible${c.reset}`);
}

async function main() {
  console.log(`${c.bold}WattFarm — manual payout cycle${c.reset}`);

  await describeEligibility();

  const before = await prisma.playerPayout.count();

  console.log(`\n${c.bold}${c.cyan}Running cycle${c.reset}`);
  const started = Date.now();
  await runPayoutCycle();
  const elapsed = Date.now() - started;

  const after = await prisma.playerPayout.count();
  const created = after - before;

  console.log(`  completed in ${elapsed}ms`);
  console.log(`  payouts created: ${created}`);

  if (created === 0) {
    console.log(
      `\n  ${c.yellow}No payouts were created.${c.reset} ` +
        `Re-run with --explain to see why each player was skipped.`
    );
  } else {
    const recent = await prisma.playerPayout.findMany({
      orderBy: { timestamp: 'desc' },
      take: created,
    });

    console.log(`\n${c.bold}${c.cyan}Created${c.reset}`);
    for (const payout of recent) {
      // `amount` is a Decimal here; String() shows the exact stored value.
      console.log(
        `  ${payout.userId.slice(0, 8)}…  +${String(payout.amount)} VLT  ` +
          `${c.dim}${payout.details}${c.reset}`
      );
    }

    console.log(
      `\n  ${c.green}Run the cycle again without building anything: the payout should be ` +
        `the same, because it now depends on power rate rather than elapsed time.${c.reset}`
    );
  }
}

main()
  .catch((err) => {
    console.error(`\n${c.red}Payout run failed: ${err.stack || err.message}${c.reset}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Disconnect, then let the loop drain — process.exit() here would abort
    // libuv mid-teardown on Windows.
    await prisma.$disconnect();
  });
