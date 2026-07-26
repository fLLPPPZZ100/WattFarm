import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { economyLimiter } from '../middleware/rateLimit.js';
import { calculateAccumulatedW } from '../services/wCalculator.js';

const router = Router();

// GET /api/assets/catalog — list all 3 assets with current price
router.get('/catalog', verifyAuth, async (req, res) => {
  try {
    const catalog = await prisma.assetCatalog.findMany();

    const playerAssets = await prisma.playerAsset.findMany({
      where: { userId: req.uid },
    });

    const quantityMap = {};
    for (const pa of playerAssets) {
      quantityMap[pa.type] = pa.quantity;
    }

    const result = catalog.map((item) => ({
      type: item.type,
      basePrice: item.basePrice,
      multiplier: item.multiplier,
      baseW: item.baseW,
      currentPrice: item.basePrice,
      quantityOwned: quantityMap[item.type] || 0,
    }));

    res.json({ catalog: result });
  } catch (err) {
    console.error('Catalog error:', err);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});

// POST /api/assets/buy — purchase one or more assets
// Body: { type, quantity? (default 1) }
// Price is calculated progressively: each unit costs more due to the multiplier
router.post(
  '/buy',
  economyLimiter,
  verifyAuthStrict,
  requireVerifiedEmail,
  async (req, res) => {
  try {
    const { type, quantity } = req.body;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    // Guard against absurd quantities: the transaction below would otherwise
    // accept e.g. 1e9 units, and Number overflow could make totalPrice lose
    // precision or become Infinity.
    if (qty > 1000) {
      return res.status(400).json({ error: 'Cannot buy more than 1000 units at once.' });
    }

    if (!['solar', 'panel-mount', 'panel-mount-double'].includes(type)) {
      return res.status(400).json({ error: 'Invalid asset type. Must be solar, panel-mount, or panel-mount-double.' });
    }

    const catalogEntry = await prisma.assetCatalog.findUnique({ where: { type } });
    if (!catalogEntry) {
      return res.status(404).json({ error: 'Asset type not found in catalog' });
    }

    const [user, playerAsset] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.uid } }),
      prisma.playerAsset.findFirst({ where: { userId: req.uid, type } }),
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fixed price — no progressive multiplier
    const unitPrice = catalogEntry.basePrice;
    let totalPrice = Math.round(unitPrice * qty * 100) / 100;

    if (user.vltBalance < totalPrice) {
      return res.status(400).json({
        error: 'Insufficient VLT balance',
        required: totalPrice,
        balance: user.vltBalance,
        maxAffordable: Math.floor(user.vltBalance / unitPrice),
      });
    }

    // Execute purchase in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: req.uid },
        data: { vltBalance: { decrement: totalPrice } },
      });

      let updatedAsset;
      if (playerAsset) {
        updatedAsset = await tx.playerAsset.update({
          where: { id: playerAsset.id },
          data: {
            quantity: { increment: qty },
            lastCollected: new Date(),
          },
        });
      } else {
        updatedAsset = await tx.playerAsset.create({
          data: {
            userId: req.uid,
            type,
            quantity: qty,
            lastCollected: new Date(),
          },
        });
      }

      return { user: updatedUser, asset: updatedAsset };
    });

    res.json({
      success: true,
      quantity: qty,
      totalPrice,
      newBalance: result.user.vltBalance,
      newQuantity: result.asset.quantity,
    });
  } catch (err) {
    console.error('Buy error:', err);
    res.status(500).json({ error: 'Failed to purchase asset' });
  }
});


// GET /api/assets/mine — returns player assets + accumulated W computed on-the-fly
router.get('/mine', verifyAuth, async (req, res) => {
  try {
    const [playerAssets, catalog] = await Promise.all([
      prisma.playerAsset.findMany({ where: { userId: req.uid } }),
      prisma.assetCatalog.findMany(),
    ]);

    const baseWMap = {};
    for (const entry of catalog) {
      baseWMap[entry.type] = entry.baseW;
    }

    let totalW = 0;
    const assetsWithW = playerAssets.map((asset) => {
      const baseW = baseWMap[asset.type] || 0;
      const accumulated = calculateAccumulatedW(asset, baseW);
      totalW += accumulated;
      return {
        type: asset.type,
        quantity: asset.quantity,
        accumulatedW: accumulated,
      };
    });

    const user = await prisma.user.findUnique({
      where: { id: req.uid },
      select: { vltBalance: true },
    });

    res.json({
      assets: assetsWithW,
      totalW,
      vltBalance: user ? user.vltBalance : 0,
    });
  } catch (err) {
    console.error('Mine error:', err);
    res.status(500).json({ error: 'Failed to fetch mining data' });
  }
});

export default router;