/**
 * Referral commissions — settled once per day, for the previous day.
 *
 * ## Why a daily batch rather than crediting on every event
 *
 * Crediting the referrer inline, inside the payout cron and inside the buy
 * route, would be simpler to write and considerably worse to operate:
 *
 *   - Every purchase would take a second row lock, on a *different* user's row.
 *     Two players buying while referring each other would deadlock: each holds
 *     its own row and waits for the other's.
 *   - A commission would be spread across thousands of tiny rows, so verifying
 *     "was this player paid correctly for Tuesday" would mean re-deriving it.
 *   - There would be no natural retry unit. A crash halfway through a payout
 *     cycle would leave some commissions paid and no way to tell which.
 *
 * A daily batch gives one row per (referrer, referred, kind, day), which is also
 * the unique key, so the whole run is idempotent: re-running it after a failure
 * pays nothing twice. That is the property that matters most here, because the
 * job moves currency.
 *
 * ## What counts
 *
 * `mining` — the referred player's `PlayerPayout` total for the day.
 * `purchase` — the referred player's `LedgerEntry` spending for the day, limited
 * to the kinds that represent actual spending. Commission rows in the ledger are
 * explicitly excluded, otherwise a commission would earn a commission.
 *
 * Commissions are newly minted VLT. The referred player is never debited.
 */

import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { money, roundMoney, moneyToNumber, isPositive, Prisma } from '../lib/money.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import env from '../config/env.js';

/**
 * Ledger kinds that count as the referred player spending money.
 *
 * An allowlist rather than "everything except commissions": a future credit kind
 * added to the ledger would otherwise silently start paying commission on
 * income, which is the kind of mistake that is only noticed after the currency
 * has been handed out.
 */
const SPENDING_LEDGER_KINDS = ['purchase', 'avatar-unlock', 'grid-expansion'];

/** Ledger kind used for the credit itself. */
export const COMMISSION_LEDGER_KIND = 'referral-commission';

/**
 * Midnight UTC of the day before `reference`.
 *
 * UTC, not local time: the server's timezone must not decide which day a
 * payout belongs to, or a redeploy in a different region would shift the
 * boundary and either skip or double-count a day.
 *
 * @param {Date} [reference]
 * @returns {{ start: Date, end: Date }} half-open interval [start, end)
 */
export function previousUtcDay(reference = new Date()) {
  const end = new Date(reference);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);

  return { start, end };
}

/**
 * Totals one referred player's activity for a day.
 *
 * @param {string} referredId
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<{ mining: Prisma.Decimal, purchase: Prisma.Decimal }>}
 */
async function collectActivity(referredId, start, end) {
  const [payouts, spending] = await Promise.all([
    prisma.playerPayout.aggregate({
      where: { userId: referredId, timestamp: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: {
        userId: referredId,
        kind: { in: SPENDING_LEDGER_KINDS },
        createdAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    mining: money(payouts._sum.amount),
    purchase: money(spending._sum.amount),
  };
}

/**
 * Credits one commission, or does nothing if it was already credited.
 *
 * The insert and the balance increment share a transaction, and the transaction
 * holds a lock on the *referrer's* row — the account being credited. The unique
 * index on (referrerId, referredId, kind, periodDate) is what makes a retry
 * safe: the second attempt fails the insert and the increment never runs.
 *
 * @returns {Promise<{ credited: boolean, amount: Prisma.Decimal }>}
 */
async function creditCommission({ referrerId, referredId, kind, periodDate, sourceAmount, rate }) {
  const amount = roundMoney(money(sourceAmount).mul(rate));

  // Nothing to pay: skip rather than writing a zero row, which would also
  // consume the unique key and block a later correction for that day.
  if (!isPositive(amount)) {
    return { credited: false, amount };
  }

  try {
    return await withUserLock(referrerId, async (tx) => {
      await tx.referralCommission.create({
        data: { referrerId, referredId, kind, periodDate, sourceAmount, rate, amount },
      });

      const updated = await tx.user.update({
        where: { id: referrerId },
        data: { vltBalance: { increment: amount } },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: referrerId,
          kind: COMMISSION_LEDGER_KIND,
          amount,
          reference: `${kind}:${referredId}`,
          quantity: 1,
          balanceAfter: updated.vltBalance,
        },
      });

      return { credited: true, amount };
    });
  } catch (err) {
    // Already settled for this day — the expected outcome of a retry.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { credited: false, amount, alreadySettled: true };
    }

    // The referrer's row is gone (account deleted between the query and now).
    if (err instanceof UserNotFoundError) {
      return { credited: false, amount, missingReferrer: true };
    }

    throw err;
  }
}

/**
 * Settles commissions for a single UTC day.
 *
 * @param {object} [options]
 * @param {Date} [options.periodDate] midnight UTC of the day to settle.
 *   Defaults to yesterday.
 * @returns {Promise<{ periodDate: string, pairs: number, credited: number, skipped: number, failed: number, total: number }>}
 */
export async function runCommissionCycle({ periodDate } = {}) {
  const { start, end } = periodDate
    ? { start: periodDate, end: new Date(periodDate.getTime() + 86_400_000) }
    : previousUtcDay();

  const rates = {
    mining: env.REFERRAL_MINING_RATE,
    purchase: env.REFERRAL_PURCHASE_RATE,
  };

  const summary = { periodDate: start.toISOString().slice(0, 10), pairs: 0, credited: 0, skipped: 0, failed: 0, total: 0 };

  // Every commission rate is off — nothing to do, and no reason to walk the
  // table.
  if (rates.mining <= 0 && rates.purchase <= 0) {
    return summary;
  }

  /**
   * Only players who were referred *before the end of the settled day* can
   * generate commission for it. Without this bound, someone who signed up today
   * would earn their referrer a commission for activity that predates the
   * referral.
   */
  const referred = await prisma.user.findMany({
    where: {
      referredById: { not: null },
      referredAt: { lt: end },
    },
    select: { id: true, referredById: true },
  });

  summary.pairs = referred.length;

  for (const player of referred) {
    try {
      // Defensive: the schema cannot express "referredById <> id", so a bad row
      // written by a future code path would otherwise pay someone for their own
      // activity.
      if (player.referredById === player.id) {
        console.warn(`[Referrals] skipping self-referral row for user=${player.id}`);
        summary.skipped += 1;
        continue;
      }

      const activity = await collectActivity(player.id, start, end);

      for (const [kind, rate] of Object.entries(rates)) {
        if (rate <= 0) continue;

        const sourceAmount = activity[kind];
        if (!isPositive(sourceAmount)) continue;

        const result = await creditCommission({
          referrerId: player.referredById,
          referredId: player.id,
          kind,
          periodDate: start,
          sourceAmount,
          rate,
        });

        if (result.credited) {
          summary.credited += 1;
          summary.total += moneyToNumber(result.amount);
        } else {
          summary.skipped += 1;
        }
      }
    } catch (err) {
      /**
       * One broken pair must not abort settlement for everyone else — the same
       * reasoning as the per-player try/catch in the mining payout.
       */
      summary.failed += 1;
      console.error(
        `[Referrals] settlement failed for referred=${player.id} referrer=${player.referredById}:`,
        err
      );
    }
  }

  return summary;
}

/**
 * Schedules the daily settlement.
 *
 * 00:15 UTC rather than midnight: the mining payout runs every 10 minutes on
 * the hour, so starting a quarter past leaves the 00:00 cycle finished and its
 * rows committed before the previous day is totalled. The day boundary itself is
 * exclusive (`timestamp < end`), so a late-committing payout from 23:59 is
 * counted in the day it belongs to regardless.
 */
export function startReferralCommissionCron() {
  if (env.REFERRAL_MINING_RATE <= 0 && env.REFERRAL_PURCHASE_RATE <= 0) {
    console.log('[Referrals] Commission rates are both 0 — daily settlement not scheduled');
    return;
  }

  console.log(
    '[Referrals] Daily settlement scheduled for 00:15 UTC ' +
      `(mining ${(env.REFERRAL_MINING_RATE * 100).toFixed(2)}%, ` +
      `purchases ${(env.REFERRAL_PURCHASE_RATE * 100).toFixed(2)}%)`
  );

  cron.schedule(
    '15 0 * * *',
    async () => {
      console.log('[Referrals] Running daily commission settlement...');
      try {
        const summary = await runCommissionCycle();
        console.log(
          `[Referrals] ${summary.periodDate}: ${summary.credited} credited, ` +
            `${summary.skipped} skipped, ${summary.failed} failed, ` +
            `${summary.total.toFixed(4)} VLT total`
        );
      } catch (err) {
        console.error('[Referrals] Settlement cycle failed:', err);
      }
    },
    { timezone: 'UTC' }
  );
}
