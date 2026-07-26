#!/usr/bin/env node
/**
 * Runs one mining payout cycle immediately, instead of waiting for the cron.
 *
 * Verifies the payout path end to end: that power comes from what is placed,
 * that the share is taken against the whole network rather than each player
 * independently, and that `payout.amount` reaches the client as a JSON number
 * rather than a Decimal-serialised string.
 *
 * Usage (from apps/api, so the .env is picked up):
 *
 *   node scripts/run-payout.mjs
 *   node scripts/run-payout.mjs --explain    # per-player breakdown
 *
 * Writes to the database: credits balances and inserts PlayerPayout rows.
 */

import 'dotenv/config';

import prisma from '../src/lib/prisma.js';
import { runPayoutCycle } from '../src/services/miningPayout.js';
import { getNetworkPower, BUDGET_PER_CYCLE } from '../src/services/networkPower.js';
import { computeNetworkShares } from '../src/services/powerCalculator.js';

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
 * Reports the network before paying anything.
 *
 * A player earns nothing unless panels are actually installed on a mount —
 * owning them is no longer enough, which is the whole point of the placement
 * change. Without this breakdown a cycle that pays little just looks broken.
 */
async function describeNetwork() {
  const network = await getNetworkPower();

  console.log(`\n${c.bold}${c.cyan}Network${c.reset}`);
  console.log(`  simulated baseline : ${network.baseline} W/s`);
  console.log(`  players            : ${network.playersRate} W/s from ${network.miners.length} miner(s)`);
  console.log(`  total (denominator): ${network.total} W/s`);
  console.log(`  budget per cycle   : ${BUDGET_PER_CYCLE} VLT`);

  if (network.miners.length === 0) {
    console.log(
      `\n  ${c.yellow}No miners.${c.reset} Nobody has panels installed on a mount — ` +
        `owning them in storage produces nothing.`
    );

    // Distinguish "owns nothing" from "owns panels but never placed them",
    // which is the likely case and looks identical from the payout's side.
    const idle = await prisma.playerAsset.findMany({
      where: { type: 'solar', quantity: { gt: 0 } },
      select: { userId: true, quantity: true },
    });
    for (const row of idle) {
      const placed = await prisma.placedMount.count({ where: { userId: row.userId } });
      console.log(
        `  ${c.dim}user ${row.userId.slice(0, 8)}… owns ${row.quantity} panel(s), ` +
          `${placed} mount(s) placed — install panels to start earning${c.reset}`
      );
    }
    return network;
  }

  if (explain) {
    const shares = computeNetworkShares(network.miners, network.baseline, BUDGET_PER_CYCLE);
    console.log(`\n${c.bold}${c.cyan}Projected shares${c.reset}`);

    let sum = 0;
    for (const miner of shares) {
      const pct = (miner.rate / network.total) * 100;
      sum += miner.share;
      console.log(
        `  ${miner.userId.slice(0, 8)}…  ${String(miner.rate).padStart(7)} W/s  ` +
          `${pct.toFixed(1).padStart(5)}%  ->  ${miner.share.toFixed(2).padStart(6)} VLT`
      );
    }

    // The budget must never be exceeded; an earlier formula paid each player
    // independently and minted currency as the player base grew.
    const flag = sum <= BUDGET_PER_CYCLE + 0.001 ? c.green + 'within budget' : c.red + 'OVER BUDGET';
    console.log(`  ${c.dim}total: ${sum.toFixed(2)} / ${BUDGET_PER_CYCLE} VLT${c.reset} — ${flag}${c.reset}`);
  }

  return network;
}

async function main() {
  console.log(`${c.bold}WattFarm — manual payout cycle${c.reset}`);

  await describeNetwork();

  const before = await prisma.playerPayout.count();

  console.log(`\n${c.bold}${c.cyan}Running cycle${c.reset}`);
  const started = Date.now();
  const { paid } = await runPayoutCycle();
  const elapsed = Date.now() - started;

  const after = await prisma.playerPayout.count();
  const created = after - before;

  console.log(`  completed in ${elapsed}ms`);
  console.log(`  payouts created: ${created}${paid !== created ? ` (reported ${paid})` : ''}`);

  if (created > 0) {
    const recent = await prisma.playerPayout.findMany({
      orderBy: { timestamp: 'desc' },
      take: created,
    });

    console.log(`\n${c.bold}${c.cyan}Created${c.reset}`);
    let sum = 0;
    for (const payout of recent) {
      sum += Number(payout.amount);
      // `amount` is a Decimal here; String() shows the exact stored value.
      console.log(`  ${payout.userId.slice(0, 8)}…  +${String(payout.amount)} VLT`);
    }

    const ok = sum <= BUDGET_PER_CYCLE + 0.001;
    console.log(
      `  ${ok ? c.green : c.red}total paid: ${sum.toFixed(4)} / ${BUDGET_PER_CYCLE} VLT${c.reset}`
    );

    console.log(
      `\n  ${c.dim}Run again without building anything: the payout should repeat, ` +
        `because it depends on power rate rather than elapsed time.${c.reset}`
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
