import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { economyLimiter } from '../middleware/rateLimit.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import {
  money,
  moneyToNumber,
  multiplyMoney,
  affordableUnits,
  canAfford,
} from '../lib/money.js';
import { computePowerRate, shareOf } from '../services/powerCalculator.js';
import { getNetworkPower, BUDGET_PER_CYCLE } from '../services/networkPower.js';
import { MOUNT_TYPES, PANEL_ASSET_TYPE } from '../config/mounts.js';

const router = Router();

/** Types a player may buy. Anything else is rejected before touching the database. */
const PURCHASABLE_TYPES = ['solar', 'panel-mount', 'panel-mount-double'];

/** Upper bound on a single purchase, to keep quantities and totals sane. */
const MAX_PURCHASE_QUANTITY = 1000;

// GET /api/assets/catalog — list all assets with current price
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

    // Prices are Decimal in the database; emit numbers so the frontend
    // contract is unchanged.
    const result = catalog.map((item) => ({
      type: item.type,
      basePrice: moneyToNumber(item.basePrice),
      multiplier: item.multiplier,
      baseW: item.baseW,
      currentPrice: moneyToNumber(item.basePrice),
      quantityOwned: quantityMap[item.type] || 0,
    }));

    res.json({ catalog: result });
  } catch (err) {
    console.error('Catalog error:', err);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});

/**
 * POST /api/assets/buy — purchase one or more assets.
 * Body: { type, quantity? (default 1) }
 *
 * The balance check and the debit happen inside a single transaction holding a
 * write lock on the player's row. Previously the balance was read outside the
 * transaction, so concurrent requests each saw the full balance and each was
 * authorised to spend it: ten parallel purchases with 100 VLT bought ten items
 * and left the balance at −900.
 */
router.post(
  '/buy',
  verifyAuthStrict,
  requireVerifiedEmail,
  economyLimiter,
  async (req, res) => {
    try {
      const { type, quantity } = req.body;

      if (!PURCHASABLE_TYPES.includes(type)) {
        return res.status(400).json({
          error: `Invalid asset type. Must be one of: ${PURCHASABLE_TYPES.join(', ')}.`,
        });
      }

      // Reject non-integral or non-finite quantities outright rather than
      // silently coercing them.
      const parsedQty = Number(quantity ?? 1);
      if (!Number.isFinite(parsedQty) || !Number.isInteger(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ error: 'Quantity must be a positive integer.' });
      }
      if (parsedQty > MAX_PURCHASE_QUANTITY) {
        return res
          .status(400)
          .json({ error: `Cannot buy more than ${MAX_PURCHASE_QUANTITY} units at once.` });
      }
      const qty = parsedQty;

      const catalogEntry = await prisma.assetCatalog.findUnique({ where: { type } });
      if (!catalogEntry) {
        return res.status(404).json({ error: 'Asset type not found in catalog' });
      }

      const unitPrice = money(catalogEntry.basePrice);
      const totalPrice = multiplyMoney(unitPrice, qty);

      const result = await withUserLock(req.uid, async (tx, user) => {
        // `user` was read under FOR UPDATE, so this balance cannot change
        // until the transaction commits.
        if (!canAfford(user.vltBalance, totalPrice)) {
          return {
            insufficient: true,
            balance: money(user.vltBalance),
          };
        }

        const updatedUser = await tx.user.update({
          where: { id: req.uid },
          data: { vltBalance: { decrement: totalPrice } },
        });

        const existing = await tx.playerAsset.findFirst({
          where: { userId: req.uid, type },
        });

        const updatedAsset = existing
          ? await tx.playerAsset.update({
              where: { id: existing.id },
              data: { quantity: { increment: qty } },
            })
          : await tx.playerAsset.create({
              data: {
                userId: req.uid,
                type,
                quantity: qty,
                lastCollected: new Date(),
              },
            });

        // Audit trail: purchases previously left no record, so an exploited
        // balance could not be reconstructed afterwards.
        await tx.ledgerEntry.create({
          data: {
            userId: req.uid,
            kind: 'purchase',
            amount: totalPrice,
            reference: type,
            quantity: qty,
            balanceAfter: updatedUser.vltBalance,
          },
        });

        return { insufficient: false, user: updatedUser, asset: updatedAsset };
      });

      if (result.insufficient) {
        return res.status(400).json({
          error: 'Insufficient VLT balance',
          required: moneyToNumber(totalPrice),
          balance: moneyToNumber(result.balance),
          maxAffordable: affordableUnits(result.balance, unitPrice),
        });
      }

      return res.json({
        success: true,
        quantity: qty,
        totalPrice: moneyToNumber(totalPrice),
        newBalance: moneyToNumber(result.user.vltBalance),
        newQuantity: result.asset.quantity,
      });
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Buy error:', err);
      return res.status(500).json({ error: 'Failed to purchase asset' });
    }
  }
);

/**
 * GET /api/assets/mine — inventory, balance and current power output.
 *
 * `totalW` is now the instantaneous rate produced by what is actually *placed*,
 * not an accumulated total derived from what is owned. Owning panels no longer
 * generates anything on its own — they have to be installed on a mount, which
 * is what makes the farm grid meaningful.
 */
router.get('/mine', verifyAuth, async (req, res) => {
  try {
    const [playerAssets, user, placedMounts, network] = await Promise.all([
      prisma.playerAsset.findMany({ where: { userId: req.uid } }),
      prisma.user.findUnique({
        where: { id: req.uid },
        select: { vltBalance: true },
      }),
      prisma.placedMount.findMany({ where: { userId: req.uid } }),
      getNetworkPower(),
    ]);

    const powerRate = computePowerRate(placedMounts);

    /**
     * How many of each asset are installed, so the client can show what is
     * actually free without recomputing it from a partial view. Storage used to
     * subtract a combined mount count from the single-mount total, which made
     * doubles eat into the singles' availability.
     */
    const placedByAsset = {};
    let placedPanels = 0;
    for (const mount of placedMounts) {
      const def = MOUNT_TYPES[mount.type];
      if (!def) continue;
      placedByAsset[def.assetType] = (placedByAsset[def.assetType] || 0) + 1;
      placedPanels += (mount.panels || []).filter(Boolean).length;
    }
    placedByAsset[PANEL_ASSET_TYPE] = placedPanels;

    res.json({
      assets: playerAssets.map((asset) => ({
        type: asset.type,
        quantity: asset.quantity,
        placed: placedByAsset[asset.type] || 0,
        available: Math.max(0, asset.quantity - (placedByAsset[asset.type] || 0)),
      })),
      // Kept as `totalW` for compatibility; the value is a rate in W/s.
      totalW: powerRate,
      powerRate,
      networkTotal: network.total,
      networkBaseline: network.baseline,
      estimatedReward: shareOf(powerRate, network.total, BUDGET_PER_CYCLE),
      vltBalance: user ? moneyToNumber(user.vltBalance) : 0,
    });
  } catch (err) {
    console.error('Mine error:', err);
    res.status(500).json({ error: 'Failed to fetch mining data' });
  }
});

export default router;
