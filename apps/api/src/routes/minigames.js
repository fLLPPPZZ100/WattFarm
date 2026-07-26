import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { minigameLimiter } from '../middleware/rateLimit.js';
import {
  getCooldownTier,
  getCooldownRemainingMs,
  rollLoot,
} from '../services/minigameEngine.js';

const router = Router();

// Valid game IDs
const VALID_GAMES = ['solar-swipe', 'wind-clicker', 'hydro-race'];

// GET /api/minigames/status — returns cooldown info for all 3 games
router.get('/status', verifyAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const statuses = await Promise.all(
      VALID_GAMES.map(async (game) => {
        // Count plays today
        const playCountToday = await prisma.minigameSession.count({
          where: {
            userId: req.uid,
            game,
            timestamp: { gte: todayStart },
          },
        });

        // Get last session
        const lastSession = await prisma.minigameSession.findFirst({
          where: { userId: req.uid, game },
          orderBy: { timestamp: 'desc' },
        });

        const remainingMs = getCooldownRemainingMs(
          lastSession ? lastSession.timestamp : null,
          playCountToday
        );

        const tier = getCooldownTier(playCountToday);

        return {
          game,
          playCountToday,
          cooldownTier: tier,
          cooldownRemainingMs: remainingMs,
        };
      })
    );

    res.json({ games: statuses });
  } catch (err) {
    console.error('Minigame status error:', err);
    res.status(500).json({ error: 'Failed to get minigame status' });
  }
});

// POST /api/minigames/:game/play — play a minigame
router.post(
  '/:game/play',
  minigameLimiter,
  verifyAuthStrict,
  requireVerifiedEmail,
  async (req, res) => {
  try {
    const { game } = req.params;
    if (!VALID_GAMES.includes(game)) {
      return res.status(400).json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(', ')}` });
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Count plays today
    const playCountToday = await prisma.minigameSession.count({
      where: {
        userId: req.uid,
        game,
        timestamp: { gte: todayStart },
      },
    });

    // Get last session to check cooldown
    const lastSession = await prisma.minigameSession.findFirst({
      where: { userId: req.uid, game },
      orderBy: { timestamp: 'desc' },
    });

    // Check cooldown
    const remainingMs = getCooldownRemainingMs(
      lastSession ? lastSession.timestamp : null,
      playCountToday
    );

    if (remainingMs > 0) {
      return res.status(429).json({
        error: 'Cooldown active',
        cooldownRemainingMs: remainingMs,
      });
    }

    // Roll loot (server-side RNG)
    const loot = rollLoot();

    const tier = getCooldownTier(playCountToday);

    // Execute in transaction: credit VLT + save session
    const result = await prisma.$transaction(async (tx) => {
      let updatedUser;
      if (loot.vlt > 0) {
        updatedUser = await tx.user.update({
          where: { id: req.uid },
          data: { vltBalance: { increment: loot.vlt } },
        });
      } else {
        updatedUser = await tx.user.findUnique({ where: { id: req.uid } });
      }

      const session = await tx.minigameSession.create({
        data: {
          userId: req.uid,
          game,
          cooldownTier: tier,
          result: loot.result,
          vltEarned: loot.vlt,
        },
      });

      return { user: updatedUser, session };
    });

    res.json({
      success: true,
      game,
      result: loot.result,
      vltEarned: loot.vlt,
      newBalance: result.user.vltBalance,
      playCountToday: playCountToday + 1,
    });
  } catch (err) {
    console.error('Minigame play error:', err);
    res.status(500).json({ error: 'Failed to play minigame' });
  }
});

export default router;