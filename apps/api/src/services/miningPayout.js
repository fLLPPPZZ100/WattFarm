import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { roundMoney, moneyToNumber, isPositive } from '../lib/money.js';
import { computeNetworkShares } from './powerCalculator.js';
import { getNetworkPower, BUDGET_PER_CYCLE } from './networkPower.js';
import { settleReferralForPayout } from './referral.js';

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

/**
 * Referral data for a batch of players about to be paid.
 *
 * Returns a Map of userId to their referral row, plus a `referrerPoints` Map so
 * each commission can be priced at the referrer's current tier without an extra
 * query per payout.
 *
 * @param {string[]} userIds
 */
async function loadReferralState(userIds) {
  if (userIds.length === 0) {
    return { byUser: new Map(), referrerPoints: new Map() };
  }

  const rows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, referredById: true, referralQualifiedAt: true },
  });

  const referrerIds = [...new Set(rows.map((row) => row.referredById).filter(Boolean))];

  const referrers = referrerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: referrerIds } },
        select: { id: true, referralPoints: true },
      })
    : [];

  return {
    byUser: new Map(rows.map((row) => [row.id, row])),
    referrerPoints: new Map(referrers.map((row) => [row.id, row.referralPoints])),
  };
}

/** Exported for tests and for the manual runner script. */
export async function runPayoutCycle() {
  // A payout must never pay against a stale snapshot.
  const network = await getNetworkPower({ maxAgeMs: 0 });

  if (network.miners.length === 0) return { paid: 0, commissions: 0, network };

  const shares = computeNetworkShares(network.miners, network.baseline, BUDGET_PER_CYCLE);

  /**
   * Referral state for everyone being paid, fetched in two queries rather than
   * two per player. The payout loop already runs one transaction per player;
   * adding N more round trips inside it would make the cycle scale badly.
   */
  const referralState = await loadReferralState(shares.map((miner) => miner.userId));

  let paid = 0;
  let commissions = 0;

  for (const miner of shares) {
    const payoutAmount = roundMoney(miner.share);

    // Skip amounts that round to nothing rather than writing a zero payout.
    if (!isPositive(payoutAmount)) continue;

    try {
      const commission = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: miner.userId },
          data: { vltBalance: { increment: payoutAmount } },
        });

        const payout = await tx.playerPayout.create({
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

        /**
         * Runs in the same transaction as the payout it is derived from, so a
         * rolled-back payout can never leave a commission behind. The payout id
         * is what makes it idempotent — see the unique constraint on
         * ReferralReward(sourceKind, sourceId).
         *
         * Note this issues VLT *beyond* the fixed cycle budget, on purpose. The
         * reasoning is in config/referral.js; it is not a conservation bug.
         */
        const state = referralState.byUser.get(miner.userId);
        if (!state?.referredById) return null;

        return settleReferralForPayout(tx, {
          referred: state,
          powerRate: miner.rate,
          payoutId: payout.id,
          payoutAmount,
          // The map itself, not a snapshot value: a referrer with two referrals
          // qualifying in the same cycle must see the first point before the
          // second commission is priced.
          referrerPoints: referralState.referrerPoints,
        });
      });

      paid += 1;
      if (commission) commissions += 1;
    } catch (err) {
      /**
       * One player's failure must not abort the cycle for everyone else, so each
       * payout is its own transaction and errors are logged per player.
       */
      console.error(`[MiningPayout] payout failed for user=${miner.userId}:`, err);
    }
  }

  return { paid, commissions, network };
}

export function startMiningPayoutCron() {
  console.log('[MiningPayout] Cron scheduled every 10 minutes');

  cron.schedule('*/10 * * * *', async () => {
    console.log('[MiningPayout] Running payout cycle...');
    try {
      const { paid, commissions, network } = await runPayoutCycle();
      console.log(
        `[MiningPayout] Cycle complete — ${paid} payout(s), ${commissions} referral ` +
          `commission(s), network ${network.total} W/s ` +
          `(${network.playersRate} from players + ${network.baseline} baseline)`
      );
    } catch (err) {
      console.error('[MiningPayout] Error during payout cycle:', err);
    }
  });
}
