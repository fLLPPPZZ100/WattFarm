/**
 * Referral routes.
 *
 * ## What is deliberately absent
 *
 * There is no endpoint that validates a referral code before signup. It would be
 * nicer UX — the invite page could say "invited by Ana" — but it is also an
 * oracle: anyone could walk the code space and learn which codes are live, and
 * pair that with the stats endpoint to profile accounts. A code is therefore
 * only ever resolved server-side, once, during account creation.
 *
 * There is also no endpoint that lists a referrer's invitees by name or email.
 * The commission stats report what each invitee *generated*, identified by an
 * opaque short id, because that is what the referrer needs to trust the numbers.
 * Anything more would turn an invite link into a way to harvest the addresses of
 * people who clicked it.
 */

import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { moneyToNumber } from '../lib/money.js';
import env from '../config/env.js';

const router = Router();

/** Commission rows returned in the activity feed. */
const HISTORY_LIMIT = 50;

/** Invitees listed in the breakdown. */
const REFERRED_LIMIT = 100;

/**
 * A stable, non-reversible label for an invitee.
 *
 * The uid is a Firebase identifier and is used as a foreign key across the API,
 * so it is not something to hand to another player. The first characters of the
 * uid are enough to tell two rows apart in a table without identifying anyone.
 *
 * @param {string} uid
 * @returns {string}
 */
function opaqueLabel(uid) {
  return uid.slice(0, 6).toUpperCase();
}

/**
 * GET /api/referrals/me — the player's invite code and commission statistics.
 *
 * Read-only, so `verifyAuth` (local token verification) is sufficient; the
 * global limiter covers abuse. No route here moves currency, which is why none
 * of them need `verifyAuthStrict` or a row lock.
 */
router.get('/me', verifyAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.uid },
      select: { referralCode: true, referredById: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'auth/not-provisioned' });
    }

    const [referredUsers, totals, byKind, history] = await Promise.all([
      prisma.user.findMany({
        where: { referredById: req.uid },
        select: { id: true, referredAt: true, createdAt: true },
        orderBy: { referredAt: 'desc' },
        take: REFERRED_LIMIT,
      }),
      prisma.referralCommission.aggregate({
        where: { referrerId: req.uid },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.referralCommission.groupBy({
        by: ['kind'],
        where: { referrerId: req.uid },
        _sum: { amount: true },
      }),
      prisma.referralCommission.findMany({
        where: { referrerId: req.uid },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: {
          id: true,
          kind: true,
          periodDate: true,
          sourceAmount: true,
          rate: true,
          amount: true,
          referredId: true,
        },
      }),
    ]);

    /**
     * Per-invitee earnings, aggregated in one query rather than one per invitee.
     * Empty `in` lists are avoided because Prisma turns them into `IN ()`, which
     * some engines reject.
     */
    const perReferred = referredUsers.length
      ? await prisma.referralCommission.groupBy({
          by: ['referredId'],
          where: { referrerId: req.uid, referredId: { in: referredUsers.map((u) => u.id) } },
          _sum: { amount: true },
        })
      : [];

    const earnedByReferred = new Map(
      perReferred.map((row) => [row.referredId, moneyToNumber(row._sum.amount)])
    );

    const earnedByKind = { mining: 0, purchase: 0 };
    for (const row of byKind) {
      earnedByKind[row.kind] = moneyToNumber(row._sum.amount);
    }

    return res.json({
      referralCode: user.referralCode,
      // Rates are surfaced so the UI never hardcodes a number that config can
      // change underneath it.
      rates: {
        mining: env.REFERRAL_MINING_RATE,
        purchase: env.REFERRAL_PURCHASE_RATE,
      },
      wasReferred: Boolean(user.referredById),
      totals: {
        referredCount: referredUsers.length,
        commissionCount: totals._count,
        earned: moneyToNumber(totals._sum.amount),
        earnedByKind,
      },
      referred: referredUsers.map((u) => ({
        label: opaqueLabel(u.id),
        joinedAt: u.referredAt ?? u.createdAt,
        earned: earnedByReferred.get(u.id) ?? 0,
      })),
      history: history.map((row) => ({
        id: row.id,
        kind: row.kind,
        periodDate: row.periodDate,
        sourceAmount: moneyToNumber(row.sourceAmount),
        rate: row.rate,
        amount: moneyToNumber(row.amount),
        from: opaqueLabel(row.referredId),
      })),
    });
  } catch (err) {
    console.error('[referrals/me] failed:', err);
    return res.status(500).json({ error: 'Failed to load referral data' });
  }
});

export default router;
