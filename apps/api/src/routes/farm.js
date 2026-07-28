import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict } from '../middleware/verifyAuth.js';
import { configLimiter } from '../middleware/rateLimit.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import {
  MOUNT_TYPES,
  PANEL_ASSET_TYPE,
  GRID_DEFAULT_ROWS,
  cellsFor,
  withinGrid,
  publicConfig,
} from '../config/mounts.js';
import { computePowerRate } from '../services/powerCalculator.js';
import env from '../config/env.js';

const router = Router();

/** Hard ceiling on submitted mounts, so a huge payload cannot be walked. */
const MAX_MOUNTS = 128;

function serialiseMount(mount) {
  return {
    type: mount.type,
    col: mount.col,
    row: mount.row,
    panels: mount.panels,
  };
}

/**
 * Validates a submitted layout against the rules and the player's inventory.
 *
 * This is the anti-cheat boundary: the layout decides income, and the client
 * cannot be trusted with it. Returns a list of human-readable problems, empty
 * when the layout is acceptable.
 *
 * @param {unknown} mounts
 * @param {Record<string, number>} owned quantity owned per asset type
 * @param {number} [gridRows] player's current grid rows
 */
function validateLayout(mounts, owned, gridRows = GRID_DEFAULT_ROWS) {
  const problems = [];

  if (!Array.isArray(mounts)) return ['`mounts` must be an array'];
  if (mounts.length > MAX_MOUNTS) return [`Too many mounts (max ${MAX_MOUNTS})`];

  /** Cell → index of the mount that claimed it, for overlap reporting. */
  const claimed = new Map();
  const usedByType = {};
  let panelsUsed = 0;

  mounts.forEach((mount, index) => {
    const def = MOUNT_TYPES[mount?.type];
    if (!def) {
      problems.push(`mount ${index}: unknown type "${mount?.type}"`);
      return;
    }

    const col = Number(mount.col);
    const row = Number(mount.row);
    if (!Number.isInteger(col) || !Number.isInteger(row)) {
      problems.push(`mount ${index}: col and row must be integers`);
      return;
    }

    if (!withinGrid(mount.type, col, row, gridRows)) {
      problems.push(`mount ${index}: does not fit the grid at (${col}, ${row})`);
      return;
    }

    for (const cell of cellsFor(mount.type, col, row)) {
      const key = `${cell.col},${cell.row}`;
      if (claimed.has(key)) {
        problems.push(`mount ${index}: overlaps mount ${claimed.get(key)} at (${cell.col}, ${cell.row})`);
        return;
      }
      claimed.set(key, index);
    }

    const panels = Array.isArray(mount.panels) ? mount.panels : [];
    if (panels.length > def.bays) {
      problems.push(`mount ${index}: ${panels.length} panel flags for ${def.bays} bay(s)`);
      return;
    }
    if (panels.some((flag) => typeof flag !== 'boolean')) {
      problems.push(`mount ${index}: panel flags must be booleans`);
      return;
    }

    usedByType[def.assetType] = (usedByType[def.assetType] || 0) + 1;
    panelsUsed += panels.filter(Boolean).length;
  });

  if (problems.length > 0) return problems;

  // Cannot place more than you own — the whole point of validating here.
  for (const [assetType, used] of Object.entries(usedByType)) {
    const available = owned[assetType] || 0;
    if (used > available) {
      problems.push(`placed ${used} x ${assetType} but only ${available} owned`);
    }
  }

  const panelsOwned = owned[PANEL_ASSET_TYPE] || 0;
  if (panelsUsed > panelsOwned) {
    problems.push(`placed ${panelsUsed} panels but only ${panelsOwned} owned`);
  }

  return problems;
}

/**
 * GET /api/farm/layout — the player's layout plus the rules to render it.
 *
 * Also returns the network baseline so the client can show where the player
 * stands without a second round trip.
 */
router.get('/layout', verifyAuth, async (req, res) => {
  try {
    const [mounts, user] = await Promise.all([
      prisma.placedMount.findMany({
        where: { userId: req.uid },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      }),
      // The row count is part of the rules the client renders from, so it has to
      // travel with them rather than being assumed to be the default.
      prisma.user.findUnique({ where: { id: req.uid }, select: { gridRows: true } }),
    ]);

    const powerRate = computePowerRate(mounts);

    return res.json({
      mounts: mounts.map(serialiseMount),
      powerRate,
      networkBaseline: env.NETWORK_POWER_BASELINE,
      config: publicConfig(user?.gridRows ?? GRID_DEFAULT_ROWS),
    });
  } catch (err) {
    console.error('[farm/layout] read failed:', err);
    return res.status(500).json({ error: 'Failed to load farm layout' });
  }
});

/**
 * PUT /api/farm/layout — replaces the whole layout.
 *
 * Replace rather than patch: the client already rebuilds its view on every
 * edit, and a full replace is idempotent, so a retried request cannot duplicate
 * anything. Layouts are at most a few dozen rows.
 */
router.put('/layout', verifyAuthStrict, configLimiter, async (req, res) => {
  try {
    const submitted = req.body?.mounts;

    const result = await withUserLock(req.uid, async (tx) => {
      // Inventory is read under the same lock as the write, so a purchase
      // landing concurrently cannot let the layout exceed what is owned.
      const assets = await tx.playerAsset.findMany({ where: { userId: req.uid } });
      const owned = {};
      for (const asset of assets) owned[asset.type] = asset.quantity;

      // Read the user's grid size for expansion support.
      const user = await tx.user.findUnique({ where: { id: req.uid }, select: { gridRows: true } });
      const gridRows = user?.gridRows ?? GRID_DEFAULT_ROWS;

      const problems = validateLayout(submitted, owned, gridRows);
      if (problems.length > 0) {
        return { status: 400, body: { error: 'Invalid layout', problems } };
      }

      await tx.placedMount.deleteMany({ where: { userId: req.uid } });

      if (submitted.length > 0) {
        await tx.placedMount.createMany({
          data: submitted.map((mount) => ({
            userId: req.uid,
            type: mount.type,
            col: Number(mount.col),
            row: Number(mount.row),
            panels: Array.isArray(mount.panels) ? mount.panels : [],
          })),
        });
      }

      const stored = await tx.placedMount.findMany({
        where: { userId: req.uid },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      });

      return {
        status: 200,
        body: {
          success: true,
          mounts: stored.map(serialiseMount),
          powerRate: computePowerRate(stored),
          networkBaseline: env.NETWORK_POWER_BASELINE,
          // Echoed so a save is also a chance for the client to notice a grid
          // that grew in another tab.
          config: publicConfig(gridRows),
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('[farm/layout] write failed:', err);
    return res.status(500).json({ error: 'Failed to save farm layout' });
  }
});

export default router;
