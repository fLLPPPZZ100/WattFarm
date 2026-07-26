/**
 * Referral programme.
 *
 * Rules and rationale live in config/referral.js. This module is the only place
 * that writes referral state, so every invariant is enforced in one file:
 *
 *   - a code is issued once per account and never reused
 *   - `referredById` is written only when the account row is created
 *   - nobody can refer themselves
 *   - a referrer earns only after their referral reaches the power milestone
 *   - a given mining payout produces at most one commission
 */

import { Prisma } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { roundMoney, moneyToNumber, isPositive, money } from '../lib/money.js';
import { generateCode, maskEmail, normaliseCode } from '../lib/referralCode.js';
import { QUALIFYING_POWER_RATE, SIGNUP_BONUS_VLT, levelFor } from '../config/referral.js';

// Re-exported so callers have one obvious import for referral behaviour, while
// the pure string handling stays testable on its own.
export { maskEmail, normaliseCode };

/** How many times to retry when a generated code collides with an existing one. */
const CODE_COLLISION_RETRIES = 5;

/**
 * Ensures the account has an invite code, generating one if missing.
 *
 * Codes are issued lazily rather than in a migration backfill so existing rows
 * need no data migration, and so the column can stay nullable.
 *
 * @param {string} userId
 * @param {{ client?: Prisma.TransactionClient }} [options]
 * @returns {Promise<string>}
 */
export async function ensureReferralCode(userId, { client } = {}) {
  const db = client || prisma;

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt += 1) {
    const code = generateCode();

    try {
      /**
       * Guarded by `referralCode: null`, not just the id.
       *
       * An unguarded `update` was a silent link-breaker: two concurrent calls —
       * a page load racing the session sync, or two tabs — both read null, both
       * generated a code, and the second *overwrote* the first. Any invite link
       * already shared with the first code stopped resolving, with nothing in
       * the logs to say why.
       *
       * `updateMany` lets the loser detect it lost (count 0) and adopt the
       * winner's code instead of clobbering it.
       */
      const claimed = await db.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });

      if (claimed.count === 0) {
        // Someone else issued a code first. Theirs is the real one, and it may
        // already be in circulation.
        const winner = await db.user.findUnique({
          where: { id: userId },
          select: { referralCode: true },
        });
        if (winner?.referralCode) return winner.referralCode;

        // No row at all — the account does not exist. Nothing to allocate to.
        throw new Error(`Cannot allocate a referral code: user=${userId} does not exist`);
      }

      return code;
    } catch (err) {
      // P2002 on referralCode: astronomically unlikely, but a retry is cheaper
      // than reasoning about whether "unlikely" is "impossible".
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Could not allocate a referral code for user=${userId}`);
}

/**
 * Looks up the account that owns a code.
 *
 * @param {string | null} code already normalised
 * @param {{ client?: Prisma.TransactionClient }} [options]
 * @returns {Promise<{ id: string } | null>}
 */
export async function findReferrerByCode(code, { client } = {}) {
  if (!code) return null;

  const db = client || prisma;
  return db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
}

/**
 * Resolves an inbound referral code into a referrer id, or null.
 *
 * Rejects self-referral. A cycle needs no check: `referredById` is only ever
 * written when a row is created, so the referrer necessarily predates the
 * referral and cannot be downstream of it.
 *
 * @param {object} params
 * @param {string} params.newUserId uid of the account being created
 * @param {unknown} params.rawCode code as supplied by the client
 * @param {Prisma.TransactionClient} [params.client]
 * @returns {Promise<{ referrerId: string | null, reason: string | null }>}
 */
export async function resolveReferrer({ newUserId, rawCode, client }) {
  const code = normaliseCode(rawCode);
  if (!code) return { referrerId: null, reason: rawCode ? 'invalid-code' : null };

  const referrer = await findReferrerByCode(code, { client });
  if (!referrer) return { referrerId: null, reason: 'unknown-code' };

  if (referrer.id === newUserId) return { referrerId: null, reason: 'self-referral' };

  return { referrerId: referrer.id, reason: null };
}

/**
 * Marks a referral as qualified and awards its referrer a point.
 *
 * Called from the payout cycle, which is the only place that knows a player's
 * current output. Returns the referrer's point total *after* any award, so the
 * caller can price the commission at the correct level without re-reading.
 *
 * @param {Prisma.TransactionClient} tx
 * @param {object} params
 * @param {{ id: string, referredById: string, referralQualifiedAt: Date | null }} params.referred
 * @param {number} params.powerRate current installed output, W/s
 * @param {Map<string, number>} params.referrerPoints referrer id to point total.
 *   Mutated in place when a point is awarded, so that a second referral
 *   qualifying later in the same cycle is priced at the tier the referrer has
 *   actually reached. Passing a plain number here meant every referral in a
 *   cycle was priced from the same stale snapshot and under-paid.
 * @returns {Promise<{ qualified: boolean, points: number }>}
 */
async function ensureQualified(tx, { referred, powerRate, referrerPoints }) {
  const current = referrerPoints.get(referred.referredById) ?? 0;

  if (referred.referralQualifiedAt) {
    return { qualified: true, points: current };
  }

  if (powerRate < QUALIFYING_POWER_RATE) {
    return { qualified: false, points: current };
  }

  /**
   * Guarded by `referralQualifiedAt: null` rather than just the id, so two
   * concurrent cycles cannot both award a point for the same referral. The
   * second update matches zero rows.
   */
  const claimed = await tx.user.updateMany({
    where: { id: referred.id, referralQualifiedAt: null },
    data: { referralQualifiedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Someone else qualified this referral first; the point is already theirs.
    return { qualified: true, points: current };
  }

  const updated = await tx.user.update({
    where: { id: referred.referredById },
    data: { referralPoints: { increment: 1 } },
    select: { referralPoints: true },
  });

  // Read the post-increment value back rather than assuming current + 1: the
  // snapshot may already have been stale before this cycle started.
  referrerPoints.set(referred.referredById, updated.referralPoints);

  return { qualified: true, points: updated.referralPoints };
}

/**
 * Credits a referrer their commission on one mining payout.
 *
 * Must run inside the same transaction as the payout it derives from, so a
 * rolled-back payout cannot leave a commission behind.
 *
 * @param {Prisma.TransactionClient} tx
 * @param {object} params
 * @param {{ id: string, referredById: string | null, referralQualifiedAt: Date | null }} params.referred
 * @param {number} params.powerRate
 * @param {string} params.payoutId
 * @param {Prisma.Decimal} params.payoutAmount
 * @param {Map<string, number>} params.referrerPoints mutated when a point is awarded
 * @returns {Promise<{ referrerId: string, amount: number, rate: number } | null>}
 */
export async function settleReferralForPayout(
  tx,
  { referred, powerRate, payoutId, payoutAmount, referrerPoints }
) {
  if (!referred?.referredById) return null;

  const { qualified, points } = await ensureQualified(tx, {
    referred,
    powerRate,
    referrerPoints,
  });

  if (!qualified) return null;

  const tier = levelFor(points);
  const commission = roundMoney(money(payoutAmount).mul(tier.commissionRate));

  // A tiny payout can round to zero at four decimal places; writing a zero-value
  // reward row would only add noise.
  if (!isPositive(commission)) return null;

  try {
    await tx.referralReward.create({
      data: {
        referrerId: referred.referredById,
        referredId: referred.id,
        beneficiary: 'referrer',
        amount: commission,
        rateApplied: tier.commissionRate,
        sourceKind: 'mining-payout',
        sourceId: payoutId,
      },
    });
  } catch (err) {
    /**
     * Unique violation on (sourceKind, sourceId): this payout was already
     * commissioned. Swallowing it is the point of the constraint — it makes a
     * re-run of the cycle safe instead of doubling somebody's income.
     */
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  }

  await tx.user.update({
    where: { id: referred.referredById },
    data: { vltBalance: { increment: commission } },
  });

  return {
    referrerId: referred.referredById,
    amount: moneyToNumber(commission),
    rate: tier.commissionRate,
  };
}

/**
 * Records the joining bonus for a player who signed up through an invite.
 *
 * The balance itself is set by the caller when it creates the row (one write
 * instead of a create-then-increment); this only writes the audit trail.
 *
 * @param {Prisma.TransactionClient} tx
 * @param {{ referrerId: string, referredId: string }} params
 */
export async function recordSignupBonus(tx, { referrerId, referredId }) {
  if (!isPositive(SIGNUP_BONUS_VLT)) return;

  await tx.referralReward.create({
    data: {
      referrerId,
      referredId,
      beneficiary: 'referred',
      amount: roundMoney(SIGNUP_BONUS_VLT),
      rateApplied: 0,
      sourceKind: 'signup-bonus',
      // The new account's id — unique per user, so the bonus cannot be
      // written twice for the same account.
      sourceId: referredId,
    },
  });
}

/**
 * Everything the referral page needs, in one round trip.
 *
 * @param {string} userId
 */
export async function getReferralSummary(userId) {
  const code = await ensureReferralCode(userId);

  const [self, referrals, commissionTotal, bonusReceived] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralPoints: true, referredById: true },
    }),
    prisma.user.findMany({
      where: { referredById: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        referralQualifiedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      // A referrer with thousands of invites does not need them all in one
      // response; the totals below are computed over the full set regardless.
      take: 100,
    }),
    prisma.referralReward.aggregate({
      where: { referrerId: userId, beneficiary: 'referrer' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.referralReward.findFirst({
      where: { referredId: userId, beneficiary: 'referred' },
      select: { amount: true, createdAt: true },
    }),
  ]);

  const points = self?.referralPoints ?? 0;
  const tier = levelFor(points);

  // Earnings per referral, so the page can show which invites actually pay.
  const perReferral = await prisma.referralReward.groupBy({
    by: ['referredId'],
    where: { referrerId: userId, beneficiary: 'referrer' },
    _sum: { amount: true },
  });

  const earnedByReferral = new Map(
    perReferral.map((row) => [row.referredId, moneyToNumber(row._sum.amount)])
  );

  const [totalReferrals, qualifiedReferrals] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.user.count({ where: { referredById: userId, referralQualifiedAt: { not: null } } }),
  ]);

  return {
    code,
    level: tier.level,
    commissionRate: tier.commissionRate,
    points,
    nextLevel: tier.next
      ? {
          level: tier.next.level,
          commissionRate: tier.next.commissionRate,
          pointsRequired: tier.next.pointsRequired,
          pointsRemaining: Math.max(0, tier.next.pointsRequired - points),
        }
      : null,
    totals: {
      referrals: totalReferrals,
      qualified: qualifiedReferrals,
      commissionEarned: moneyToNumber(commissionTotal._sum.amount),
      commissionPayments: commissionTotal._count,
    },
    /** Set when this player themselves joined through somebody's invite. */
    joinedViaInvite: self?.referredById
      ? {
          bonus: bonusReceived ? moneyToNumber(bonusReceived.amount) : 0,
          at: bonusReceived?.createdAt ?? null,
        }
      : null,
    referrals: referrals.map((referral) => ({
      // The referred player's uid is deliberately omitted — the referrer has no
      // use for it and it is the key to every other endpoint.
      email: maskEmail(referral.email),
      joinedAt: referral.createdAt,
      qualified: referral.referralQualifiedAt !== null,
      qualifiedAt: referral.referralQualifiedAt,
      earned: earnedByReferral.get(referral.id) ?? 0,
    })),
  };
}

export default {
  ensureReferralCode,
  normaliseCode,
  resolveReferrer,
  settleReferralForPayout,
  recordSignupBonus,
  getReferralSummary,
};
