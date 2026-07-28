import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { moneyToNumber } from '../lib/money.js';

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

/**
 * GET /api/mining/history — payout history for the current user.
 *
 * This router used to also own `GET`/`POST /allocations`, which split a player's
 * power across solar, wind and hydro networks. Wind and hydro are gone, so there
 * is nothing to allocate — every watt on the field counts towards the one
 * budget. See services/miningPayout.js.
 */
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
    console.error('Payout history error:', err);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

export default router;
