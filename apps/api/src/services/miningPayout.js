import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { roundMoney, moneyToNumber, isPositive } from '../lib/money.js';
import { computeNetworkShares } from './powerCalculator.js';
import { getNetworkPower, BUDGET_PER_CYCLE } from './networkPower.js';

/**
 * Simulated mining payout: runs every 10 minutes.
 *
 * A fixed budget is split between every player by their share of the network.
 * Nothing here touches real currency.
 *
 * ## What this used to be
 *
 * Three things changed, each fixing a real defect:
 *
 * 1. Output came from the quantity a player *owned* multiplied by elapsed time,
 *    so placement was irrelevant and the farm was decoration. It now comes from
 *    what is actually installed.
 *
 * 2. Payment required a `MiningAllocation` row, and nothing created one. A new
 *    player could build a working farm, watch it report watts, and earn nothing
 *    forever because they had never opened the Profile page. Allocations are
 *    gone entirely — with a single energy source there was no decision to make,
 *    only a way to lose income by pointing power at a network that paid nothing.
 *
 * 3. Each player's share was computed independently against the baseline, which
 *    minted currency as the player base grew: ten players at 40 W/s were paid
 *    25 VLT each, so a 50 VLT budget paid out 250. Shares are now taken against
 *    one shared denominator.
 */

/** Exported for tests and for the manual runner script. */
export async function runPayoutCycle() {
  // A payout must never pay against a stale snapshot.
  const network = await getNetworkPower({ maxAgeMs: 0 });

  if (network.miners.length === 0) return { paid: 0, network };

  const shares = computeNetworkShares(network.miners, network.baseline, BUDGET_PER_CYCLE);

  let paid = 0;

  for (const miner of shares) {
    const payoutAmount = roundMoney(miner.share);

    // Skip amounts that round to nothing rather than writing a zero payout.
    if (!isPositive(payoutAmount)) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: miner.userId },
          data: { vltBalance: { increment: payoutAmount } },
        });

        await tx.playerPayout.create({
          data: {
            userId: miner.userId,
            amount: payoutAmount,
            details: JSON.stringify({
              powerRate: miner.rate,
              networkTotal: network.total,
              networkBaseline: network.baseline,
              sharePercent: Math.round((miner.rate / network.total) * 10000) / 100,
              budget: BUDGET_PER_CYCLE,
              payout: moneyToNumber(payoutAmount),
            }),
          },
        });
      });

      paid += 1;
    } catch (err) {
      /**
       * One player's failure must not abort the cycle for everyone else, so each
       * payout is its own transaction and errors are logged per player.
       */
      console.error(`[MiningPayout] payout failed for user=${miner.userId}:`, err);
    }
  }

  return { paid, network };
}

export function startMiningPayoutCron() {
  console.log('[MiningPayout] Cron scheduled every 10 minutes');

  cron.schedule('*/10 * * * *', async () => {
    console.log('[MiningPayout] Running payout cycle...');
    try {
      const { paid, network } = await runPayoutCycle();
      console.log(
        `[MiningPayout] Cycle complete — ${paid} payout(s), network ${network.total} W/s ` +
          `(${network.playersRate} from players + ${network.baseline} baseline)`
      );
    } catch (err) {
      console.error('[MiningPayout] Error during payout cycle:', err);
    }
  });
}
