import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { roundMoney, moneyToNumber, isPositive } from '../lib/money.js';
import { computePowerRate, computeShare, networkTotal } from './powerCalculator.js';
import env from '../config/env.js';

/**
 * Simulated mining payout: runs every 10 minutes.
 *
 * Each network has a fixed budget, split by power share against a synthetic
 * network baseline. Nothing here touches real currency.
 *
 * ## What changed and why
 *
 * The previous version summed an ever-growing "accumulated W" derived from the
 * quantity a player *owned* and split the budget proportionally between
 * players. That had three problems:
 *
 *   1. Placement was irrelevant, so the farm was decoration.
 *   2. With one player the split always paid the full budget, so building more
 *      changed nothing — 5,745 W and 17,784 W both paid exactly 50 VLT.
 *   3. `lastCollected` was only written on purchase, so accumulated watts grew
 *      without bound and buying an asset *reduced* a player's share.
 *
 * Now the payout uses the instantaneous power rate of what is actually placed,
 * measured against `NETWORK_POWER_BASELINE`. That is the genre model — a
 * hashrate competing for a block reward — and it needs no timestamps, so there
 * is nothing to reset and a layout change simply applies at the next cycle.
 */

const BUDGET_PER_NETWORK = {
  solar: 50,
  wind: 50,
  hydro: 50,
};

/**
 * Which placed mounts contribute to a network.
 *
 * Only solar exists as a placeable asset today; wind and hydro have budgets and
 * allocation sliders but nothing to place, so they pay nothing. That is
 * intentional rather than an oversight — see DECISIONS.md.
 */
const NETWORK_SOURCES = {
  solar: 'placed-mounts',
  wind: null,
  hydro: null,
};

/** Exported for tests and for the manual runner script. */
export async function runPayoutCycle() {
  for (const [network, budget] of Object.entries(BUDGET_PER_NETWORK)) {
    if (NETWORK_SOURCES[network] !== 'placed-mounts') continue;

    const allocations = await prisma.miningAllocation.findMany({ where: { network } });
    if (allocations.length === 0) continue;

    for (const allocation of allocations) {
      try {
        // Power comes from what is placed, so the grid finally matters.
        const placed = await prisma.placedMount.findMany({
          where: { userId: allocation.userId },
        });

        const fullRate = computePowerRate(placed);
        if (fullRate <= 0) continue;

        // The allocation slider decides how much of that power is pointed at
        // this network.
        const effectiveRate = fullRate * (allocation.percentage / 100);
        if (effectiveRate <= 0) continue;

        const share = computeShare(effectiveRate, env.NETWORK_POWER_BASELINE, budget);
        const payoutAmount = roundMoney(share);

        // Skip amounts that round to nothing rather than writing a zero payout.
        if (!isPositive(payoutAmount)) continue;

        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: allocation.userId },
            data: { vltBalance: { increment: payoutAmount } },
          });

          await tx.playerPayout.create({
            data: {
              userId: allocation.userId,
              amount: payoutAmount,
              details: JSON.stringify({
                network,
                powerRate: Math.round(fullRate * 100) / 100,
                effectiveRate: Math.round(effectiveRate * 100) / 100,
                networkBaseline: env.NETWORK_POWER_BASELINE,
                networkTotal: Math.round(networkTotal(effectiveRate, env.NETWORK_POWER_BASELINE) * 100) / 100,
                percentage: allocation.percentage,
                budget,
                payout: moneyToNumber(payoutAmount),
              }),
            },
          });
        });
      } catch (err) {
        /**
         * One player's failure must not abort the cycle for everyone else, so
         * each payout is its own transaction and errors are logged per player.
         */
        console.error(
          `[MiningPayout] payout failed for user=${allocation.userId} network=${network}:`,
          err
        );
      }
    }
  }
}

export function startMiningPayoutCron() {
  console.log(
    `[MiningPayout] Cron scheduled every 10 minutes (network baseline: ${env.NETWORK_POWER_BASELINE} W/s)`
  );

  cron.schedule('*/10 * * * *', async () => {
    console.log('[MiningPayout] Running payout cycle...');
    try {
      await runPayoutCycle();
      console.log('[MiningPayout] Cycle complete');
    } catch (err) {
      console.error('[MiningPayout] Error during payout cycle:', err);
    }
  });
}
