#!/usr/bin/env node
/**
 * Runs one mining payout cycle immediately, instead of waiting for the cron.
 *
 * Useful for verifying the payout path end to end — including that
 * `lastCollected` is consumed correctly and that `payout.amount` reaches the
 * client as a JSON number rather than a Decimal-serialised string.
 *
 * Usage (from apps/api, so the .env is picked up):
 *
 *   node scripts/run-payout.mjs
 *   node scripts/run-payout.mjs --explain    # also print why players were skipped
 *
 * Writes to the database: credits balances and inserts PlayerPayout rows.
 */

import 'dotenv/config';

import prisma from '../src/lib/prisma.js';
import { runPayoutCycle } from '../src/services/miningPayout.js';
import { calculateAccumulatedW } from '../src/services/wCalculator.js';

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
 * Explains, per network, whether anyone is eligible.
 *
 * A payout produces nothing unless a player has BOTH a mining allocation for
 * the network AND a PlayerAsset of that type with quantity > 0 — a combination
 * that is easy to miss when testing, and which otherwise just looks like the
 * cycle silently did nothing.
 */
async function describeEligibility() {
  const networks = ['solar', 'wind', 'hydro'];

  console.log(`\n${c.bold}${c.cyan}Eligibility${c.reset}`);

  for (const network of networks) {
    const allocations = await prisma.miningAllocation.findMany({ where: { network } });

    if (allocations.length === 0) {
      console.log(
        `  ${c.yellow}${network}${c.reset}: no allocations — ` +
          `set a percentage on the Profile page for anyone to earn from it`
      );
      continue;
    }

    const catalogEntry = await prisma.assetCatalog.findUnique({ where: { type: network } });
    const baseW = catalogEntry?.baseW ?? 0;

    let eligible = 0;
    for (const alloc of allocations) {
      const asset = await prisma.playerAsset.findFirst({
        where: { userId: alloc.userId, type: network },
      });

      if (!asset || asset.quantity === 0) {
        if (explain) {
          console.log(
            `  ${c.dim}${network}: user ${alloc.userId.slice(0, 8)}… allocated ` +
              `${alloc.percentage}% but owns no ${network} asset${c.reset}`
          );
        }
        continue;
      }

      const accumulated = calculateAccumulatedW(asset, baseW);
      if (accumulated <= 0) {
        if (explain) {
          console.log(
            `  ${c.dim}${network}: user ${alloc.userId.slice(0, 8)}… has 0 accumulated W ` +
              `(baseW=${baseW}, qty=${asset.quantity}) — wait a moment and retry${c.reset}`
          );
        }
        continue;
      }

      eligible += 1;
      if (explain) {
        console.log(
          `  ${c.dim}${network}: user ${alloc.userId.slice(0, 8)}… ` +
            `qty=${asset.quantity} accumulatedW=${accumulated.toFixed(2)} ` +
            `allocation=${alloc.percentage}%${c.reset}`
        );
      }
    }

    const colour = eligible > 0 ? c.green : c.yellow;
    console.log(
      `  ${colour}${network}${c.reset}: ${allocations.length} allocation(s), ${eligible} eligible`
    );
  }
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
      `\n  ${c.green}Now check the wallet page, or re-run the concurrency probe ` +
        `with --skip-buy --skip-game to confirm the amount serialises as a number.${c.reset}`
    );
  }
}

main()
  .catch((err) => {
    console.error(`\n${c.red}Payout run failed: ${err.stack || err.message}${c.reset}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Disconnect explicitly, then let the loop drain on its own — calling
    // process.exit() here would abort libuv mid-teardown on Windows.
    await prisma.$disconnect();
  });
