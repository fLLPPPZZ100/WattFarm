import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { moneyToNumber } from '../lib/money.js';
import { getNetworkPower, BUDGET_PER_CYCLE } from '../services/networkPower.js';
import { computePowerRate, shareOf } from '../services/powerCalculator.js';

const router = Router();

/**
 * Mining allocation was removed along with the wind and hydro networks.
 *
 * With a single energy source there was nothing to allocate — 100% always went
 * to solar — while the sliders actively punished anyone who moved them, since
 * power pointed at wind or hydro earned nothing. Worse, the payout required an
 * allocation row that nothing created, so a new player could build a working
 * farm and never be paid.
 */

/**
 * `details` is a JSON string column. A malformed value would otherwise throw
 * inside the map and fail the whole request, hiding every payout.
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
 * GET /api/mining/network — where the player stands in the simulated network.
 *
 * Income depends on share of the network rather than on raw output, so the UI
 * needs the total to say anything meaningful about earnings.
 */
router.get('/network', verifyAuth, async (req, res) => {
  try {
    const [network, placed] = await Promise.all([
      getNetworkPower(),
      prisma.placedMount.findMany({ where: { userId: req.uid } }),
    ]);

    const powerRate = computePowerRate(placed);

    return res.json({
      powerRate,
      networkTotal: network.total,
      networkBaseline: network.baseline,
      playersRate: network.playersRate,
      minerCount: network.miners.length,
      budgetPerCycle: BUDGET_PER_CYCLE,
      estimatedReward: shareOf(powerRate, network.total, BUDGET_PER_CYCLE),
    });
  } catch (err) {
    console.error('[mining/network] failed:', err);
    return res.status(500).json({ error: 'Failed to load network status' });
  }
});

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
      // `amount` is Decimal and would serialise as a JSON *string*, breaking
      // `amount.toFixed(2)` on the wallet page. Convert at the boundary.
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
