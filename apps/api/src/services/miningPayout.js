import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { roundMoney, moneyToNumber, isPositive } from '../lib/money.js';
import { computePowerRate, computeShare, networkTotal } from './powerCalculator.js';
import env from '../config/env.js';

/**
 * Simulated mining payout: runs every 10 minutes.
 *
 * A fixed budget is split by power share against a synthetic network baseline.
 * Nothing here touches real currency.
 *
 * ## Why the rate model
 *
 * An earlier version summed an ever-growing "accumulated W" derived from the
 * quantity a player *owned* and split the budget between players. That had three
 * problems:
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
 *
 * ## Why there is no allocation step
 *
 * Payouts used to be driven by `MiningAllocation` rows that split a player's
 * power across solar, wind and hydro. Wind and hydro never existed as placeable
 * assets, so two thirds of the budget was never paid and the split had exactly
 * one valid setting. Both are gone: every watt a player places counts, and the
 * cron walks players rather than allocation rows.
 *
 * That also removes a failure mode. A player with no allocation row was skipped
 * entirely — they could own panels, place them, watch the counter rise and never
 * earn anything. There is no longer a row that can be missing.
 */

/** VLT paid out per cycle, shared between everyone mining. */
const BUDGET_PER_CYCLE = 50;

/** Exported for tests and for the manual runner script. */
export async function runPayoutCycle() {
  /**
   * Everyone with something on the field. Grouping the mounts by player in one
   * query avoids a per-player round trip, and a player with an empty farm is
   * simply absent rather than fetched and discarded.
   */
  const placedMounts = await prisma.placedMount.findMany({
    select: { userId: true, type: true, panels: true },
  });

  if (placedMounts.length === 0) return;

  const byUser = new Map();
  for (const mount of placedMounts) {
    const mounts = byUser.get(mount.userId);
    if (mounts) mounts.push(mount);
    else byUser.set(mount.userId, [mount]);
  }

  for (const [userId, mounts] of byUser) {
    try {
      const rate = computePowerRate(mounts);
      if (rate <= 0) continue;

      const share = computeShare(rate, env.NETWORK_POWER_BASELINE, BUDGET_PER_CYCLE);
      const payoutAmount = roundMoney(share);

      // Skip amounts that round to nothing rather than writing a zero payout.
      if (!isPositive(payoutAmount)) continue;

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { vltBalance: { increment: payoutAmount } },
        });

        await tx.playerPayout.create({
          data: {
            userId,
            amount: payoutAmount,
            details: JSON.stringify({
              powerRate: Math.round(rate * 100) / 100,
              networkBaseline: env.NETWORK_POWER_BASELINE,
              networkTotal: Math.round(networkTotal(rate, env.NETWORK_POWER_BASELINE) * 100) / 100,
              budget: BUDGET_PER_CYCLE,
              payout: moneyToNumber(payoutAmount),
            }),
          },
        });
      });
    } catch (err) {
      /**
       * One player's failure must not abort the cycle for everyone else, so each
       * payout is its own transaction and errors are logged per player.
       */
      console.error(`[MiningPayout] payout failed for user=${userId}:`, err);
    }
  }
}

export function startMiningPayoutCron() {
  console.log(
    `[MiningPayout] Cron scheduled every 10 minutes ` +
      `(budget ${BUDGET_PER_CYCLE} VLT, network baseline ${env.NETWORK_POWER_BASELINE} W/s)`
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
