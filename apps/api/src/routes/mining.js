import { Router } from 'express';
import prisma from '../lib/prisma.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = Router();

const VALID_NETWORKS = ['solar', 'wind', 'hydro'];

// GET /api/mining/allocations — get current user's mining allocations
router.get('/allocations', verifyAuth, async (req, res) => {
  try {
    const allocations = await prisma.miningAllocation.findMany({
      where: { userId: req.uid },
      orderBy: { network: 'asc' },
    });

    res.json({ allocations });
  } catch (err) {
    console.error('Mining allocations error:', err);
    res.status(500).json({ error: 'Failed to fetch allocations' });
  }
});

// POST /api/mining/allocations — set mining allocation percentages
// Body: { allocations: [{ network, percentage }] }
// Total must sum to 100
router.post('/allocations', verifyAuth, async (req, res) => {
  try {
    const { allocations } = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'Allocations array is required' });
    }

    // Validate networks and total
    const total = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (Math.abs(total - 100) > 0.01) {
      return res.status(400).json({ error: 'Allocation percentages must sum to 100' });
    }

    for (const a of allocations) {
      if (!VALID_NETWORKS.includes(a.network)) {
        return res.status(400).json({ error: `Invalid network: ${a.network}` });
      }
      if (a.percentage < 0 || a.percentage > 100) {
        return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
      }
    }

    // Delete existing allocations for user, then create new ones
    await prisma.$transaction([
      prisma.miningAllocation.deleteMany({ where: { userId: req.uid } }),
      ...allocations.map((a) =>
        prisma.miningAllocation.create({
          data: {
            userId: req.uid,
            network: a.network,
            percentage: a.percentage,
          },
        })
      ),
    ]);

    // Return updated allocations
    const updated = await prisma.miningAllocation.findMany({
      where: { userId: req.uid },
      orderBy: { network: 'asc' },
    });

    res.json({ allocations: updated });
  } catch (err) {
    console.error('Set allocations error:', err);
    res.status(500).json({ error: 'Failed to update allocations' });
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
      amount: p.amount,
      details: JSON.parse(p.details),
      timestamp: p.timestamp,
    }));

    res.json({ payouts: formatted });
  } catch (err) {
    console.error('Payout history error:', err);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

export default router;