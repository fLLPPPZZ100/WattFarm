import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuth, verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { minigameLimiter } from '../middleware/rateLimit.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import { money, moneyToNumber, isPositive } from '../lib/money.js';
import {
  getCooldownTier,
  getCooldownRemainingMs,
  rollLoot,
} from '../services/minigameEngine.js';

const router = Router();

// Valid game IDs
const VALID_GAMES = ['solar-swipe', 'wind-clicker', 'hydro-race'];

/** Start of the current UTC day, used for the per-day play count. */
function startOfUtcDay() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// GET /api/minigames/status — cooldown info for all games
router.get('/status', verifyAuth, async (req, res) => {
  try {
    const todayStart = startOfUtcDay();

    const statuses = await Promise.all(
      VALID_GAMES.map(async (game) => {
        const [playCountToday, lastSession] = await Promise.all([
          prisma.minigameSession.count({
            where: { userId: req.uid, game, timestamp: { gte: todayStart } },
          }),
          prisma.minigameSession.findFirst({
            where: { userId: req.uid, game },
            orderBy: { timestamp: 'desc' },
          }),
        ]);

        return {
          game,
          playCountToday,
          cooldownTier: getCooldownTier(playCountToday),
          cooldownRemainingMs: getCooldownRemainingMs(
            lastSession ? lastSession.timestamp : null,
            playCountToday
          ),
        };
      })
    );

    res.json({ games: statuses });
  } catch (err) {
    console.error('Minigame status error:', err);
    res.status(500).json({ error: 'Failed to get minigame status' });
  }
});

/**
 * POST /api/minigames/:game/play
 *
 * The cooldown check, the loot roll and the credit all happen inside one
 * transaction holding a write lock on the player's row.
 *
 * Previously the play count and cooldown were read outside the transaction, so
 * a burst of parallel requests all observed "cooldown expired" and all received
 * a reward — collecting many payouts inside a single cooldown window. The rate
 * limiter did not prevent it, because the limit permits exactly that burst.
 *
 * The loot roll is deliberately inside the lock too: rolling before acquiring
 * it would let a rejected request consume randomness, which is harmless today
 * but would matter for any future seeded or audited RNG.
 */
router.post(
  '/:game/play',
  verifyAuthStrict,
  requireVerifiedEmail,
  minigameLimiter,
  async (req, res) => {
    try {
      const { game } = req.params;
      if (!VALID_GAMES.includes(game)) {
        return res
          .status(400)
          .json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(', ')}` });
      }

      const todayStart = startOfUtcDay();

      const outcome = await withUserLock(req.uid, async (tx) => {
        const [playCountToday, lastSession] = await Promise.all([
          tx.minigameSession.count({
            where: { userId: req.uid, game, timestamp: { gte: todayStart } },
          }),
          tx.minigameSession.findFirst({
            where: { userId: req.uid, game },
            orderBy: { timestamp: 'desc' },
          }),
        ]);

        const remainingMs = getCooldownRemainingMs(
          lastSession ? lastSession.timestamp : null,
          playCountToday
        );

        if (remainingMs > 0) {
          return {
            status: 429,
            body: { error: 'Cooldown active', cooldownRemainingMs: remainingMs },
          };
        }

        // Server-side RNG — the client never influences the result.
        const loot = rollLoot();
        const tier = getCooldownTier(playCountToday);
        const reward = money(loot.vlt);

        const updatedUser = isPositive(reward)
          ? await tx.user.update({
              where: { id: req.uid },
              data: { vltBalance: { increment: reward } },
            })
          : await tx.user.findUnique({ where: { id: req.uid } });

        await tx.minigameSession.create({
          data: {
            userId: req.uid,
            game,
            cooldownTier: tier,
            result: loot.result,
            vltEarned: reward,
          },
        });

        return {
          status: 200,
          body: {
            success: true,
            game,
            result: loot.result,
            vltEarned: moneyToNumber(reward),
            newBalance: moneyToNumber(updatedUser.vltBalance),
            playCountToday: playCountToday + 1,
          },
        };
      });

      return res.status(outcome.status).json(outcome.body);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Minigame play error:', err);
      return res.status(500).json({ error: 'Failed to play minigame' });
    }
  }
);

export default router;
