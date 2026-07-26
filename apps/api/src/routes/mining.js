import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { configLimiter } from '../middleware/rateLimit.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import { moneyToNumber } from '../lib/money.js';
import { validateAllocations } from '../services/allocationRules.js';

const router = Router();

/**
 * `details` is a JSON string column. A malformed value would otherwise throw
 * inside the map and fail the whole history request, hiding every payout.
 */
function safeParseDetails(raw, payoutId) {
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`[mining/history] unparseable details for payout ${payoutId}`);
    return {};
  }
}

/** Only the fields the client needs — `id` and `userId` are internal. */
function serialiseAllocation(allocation) {
  return {
    network: allocation.network,
    percentage: allocation.percentage,
    updatedAt: allocation.updatedAt,
  };
}

// GET /api/mining/allocations — current user's mining allocations
router.get('/allocations', verifyAuth, async (req, res) => {
  try {
    const allocations = await prisma.miningAllocation.findMany({
      where: { userId: req.uid },
      orderBy: { network: 'asc' },
    });

    res.json({ allocations: allocations.map(serialiseAllocation) });
  } catch (err) {
    console.error('[mining/allocations] read failed:', err);
    res.status(500).json({ error: 'Failed to fetch allocations', code: 'allocations/read-failed' });
  }
});

/**
 * POST /api/mining/allocations — replace the player's allocation split.
 * Body: { allocations: [{ network, percentage }] }, summing to 100.
 *
 * ## Why this route is locked and gated
 *
 * The allocation split decides how much of a player's power is pointed at each
 * network, and therefore how much VLT the payout cron awards them. It is an
 * economy route, but it was the only mutating one that ran without
 * `withUserLock` and without `requireVerifiedEmail` — purchases, minigame plays
 * and layout writes all had both.
 *
 * ## Why upsert instead of delete-then-create
 *
 * The write used to be `deleteMany` followed by one `create` per entry. Inside a
 * transaction but with no lock, two concurrent saves could interleave and leave
 * duplicate rows for a network, and the payout cron pays each row it finds. The
 * delete also discarded `id` and `createdAt` on every save, so a row's history
 * was reset by an unrelated slider change.
 *
 * Upserting against the `(userId, network)` unique constraint is idempotent: a
 * retried request produces the same state, and rows keep their identity.
 * Networks the player left out are removed afterwards, inside the same
 * transaction, so omitting a slider still means zero.
 */
router.post(
  '/allocations',
  verifyAuthStrict,
  requireVerifiedEmail,
  configLimiter,
  async (req, res) => {
    try {
      const { problems, allocations } = validateAllocations(req.body?.allocations);

      if (problems.length > 0) {
        return res.status(400).json({
          // The first problem is the message, so a client that only renders
          // `error` still shows something specific rather than a generic
          // "invalid request".
          error: problems[0],
          code: 'allocations/invalid',
          problems,
        });
      }

      const submittedNetworks = allocations.map((a) => a.network);

      const stored = await withUserLock(req.uid, async (tx) => {
        for (const { network, percentage } of allocations) {
          await tx.miningAllocation.upsert({
            where: { userId_network: { userId: req.uid, network } },
            update: { percentage },
            create: { userId: req.uid, network, percentage },
          });
        }

        // A network the player zeroed out is absent from the payload (the UI
        // filters those), so it has to be deleted rather than set to 0 —
        // otherwise an old value would keep earning.
        await tx.miningAllocation.deleteMany({
          where: { userId: req.uid, network: { notIn: submittedNetworks } },
        });

        return tx.miningAllocation.findMany({
          where: { userId: req.uid },
          orderBy: { network: 'asc' },
        });
      });

      return res.json({ allocations: stored.map(serialiseAllocation) });
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).json({ error: 'User not found', code: 'user/not-found' });
      }
      console.error('[mining/allocations] write failed:', err);
      return res
        .status(500)
        .json({ error: 'Failed to update allocations', code: 'allocations/write-failed' });
    }
  }
);

// GET /api/mining/history — payout history for the current user
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const payouts = await prisma.playerPayout.findMany({
      where: { userId: req.uid },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const formatted = payouts.map((p) => ({
      id: p.id,
      // `amount` is Decimal in the database and would serialise as a JSON
      // *string*, breaking `amount.toFixed(2)` on the wallet page. Convert at
      // the boundary so the API keeps emitting numbers.
      amount: moneyToNumber(p.amount),
      details: safeParseDetails(p.details, p.id),
      timestamp: p.timestamp,
    }));

    res.json({ payouts: formatted });
  } catch (err) {
    console.error('[mining/history] read failed:', err);
    res.status(500).json({ error: 'Failed to fetch payout history', code: 'history/read-failed' });
  }
});

export default router;
