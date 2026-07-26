import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { calculateAccumulatedW } from './wCalculator.js';
import { roundMoney, moneyToNumber } from '../lib/money.js';

/**
 * Simulated mining payout: runs every 10 minutes.
 *
 * For each network the accumulated W of every participating player is summed,
 * and a fictitious budget is split proportionally. Nothing here touches real
 * currency.
 *
 * ## Why `lastCollected` is reset
 *
 * `calculateAccumulatedW` returns `baseW × quantity × (now − lastCollected)`,
 * and `lastCollected` used to be written only when a player bought an asset.
 * Nothing ever "collected" the accumulated watts, so the value grew without
 * bound. Because the budget is divided proportionally, whoever had bought
 * longest ago dominated the split, and buying a new asset *reduced* a player's
 * share by resetting their timer — the opposite of the intended incentive.
 *
 * Each cycle now consumes the watts it paid for, so a payout reflects
 * generation during that cycle. The reset happens in the same transaction as
 * the credit, so a failure cannot pay out twice or silently discard production.
 */

const BUDGET_PER_NETWORK = {
  solar: 50,
  wind: 50,
  hydro: 50,
};

/** Exported for tests and for manual invocation; the cron simply calls it. */
export async function runPayoutCycle() {
  const networks = Object.keys(BUDGET_PER_NETWORK);

  const catalog = await prisma.assetCatalog.findMany();
  const baseWMap = {};
  for (const entry of catalog) {
    baseWMap[entry.type] = entry.baseW;
  }

  for (const network of networks) {
    const allocations = await prisma.miningAllocation.findMany({ where: { network } });
    if (allocations.length === 0) continue;

    /**
     * Snapshot every participant's production for this cycle.
     *
     * The asset id and the timestamp used for the calculation are captured so
     * the reset below consumes exactly the interval that was paid for — using
     * `now()` again at write time would discard whatever accrued in between.
     */
    const cycleTimestamp = new Date();

    const contributions = (
      await Promise.all(
        allocations.map(async (alloc) => {
          const playerAsset = await prisma.playerAsset.findFirst({
            where: { userId: alloc.userId, type: network },
          });

          if (!playerAsset || playerAsset.quantity === 0) return null;

          const accumulatedW = calculateAccumulatedW(
            playerAsset,
            baseWMap[network] || 0,
            cycleTimestamp
          );
          if (accumulatedW <= 0) return null;

          return {
            userId: alloc.userId,
            assetId: playerAsset.id,
            effectiveW: accumulatedW * (alloc.percentage / 100),
            percentage: alloc.percentage,
          };
        })
      )
    ).filter(Boolean);

    if (contributions.length === 0) continue;

    const totalEffectiveW = contributions.reduce((sum, c) => sum + c.effectiveW, 0);
    if (totalEffectiveW <= 0) continue;

    const budget = BUDGET_PER_NETWORK[network];

    for (const contrib of contributions) {
      const share = (contrib.effectiveW / totalEffectiveW) * budget;
      const payoutAmount = roundMoney(share);

      // Skip amounts that round to nothing rather than writing a zero payout.
      if (payoutAmount.lessThanOrEqualTo(0)) continue;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: contrib.userId },
            data: { vltBalance: { increment: payoutAmount } },
          });

          // Consume the production that was just paid for.
          await tx.playerAsset.update({
            where: { id: contrib.assetId },
            data: { lastCollected: cycleTimestamp },
          });

          await tx.playerPayout.create({
            data: {
              userId: contrib.userId,
              amount: payoutAmount,
              details: JSON.stringify({
                network,
                effectiveW: Math.round(contrib.effectiveW * 100) / 100,
                totalEffectiveW: Math.round(totalEffectiveW * 100) / 100,
                percentage: contrib.percentage,
                budget,
                payout: moneyToNumber(payoutAmount),
              }),
            },
          });
        });
      } catch (err) {
        /**
         * One player's failure must not abort the cycle for everybody else, so
         * each payout is its own transaction and errors are logged per player.
         */
        console.error(
          `[MiningPayout] payout failed for user=${contrib.userId} network=${network}:`,
          err
        );
      }
    }
  }
}

export function startMiningPayoutCron() {
  console.log('[MiningPayout] Cron job scheduled every 10 minutes');

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
