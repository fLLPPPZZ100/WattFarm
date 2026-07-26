import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAuthStrict, requireVerifiedEmail } from '../middleware/verifyAuth.js';
import { economyLimiter, configLimiter } from '../middleware/rateLimit.js';
import { withUserLock, UserNotFoundError } from '../lib/userLock.js';
import { money, moneyToNumber, canAfford } from '../lib/money.js';

const router = Router();

/**
 * Avatars every account may equip without buying anything.
 *
 * ## Why this list has to exist
 *
 * `PATCH /me/avatar` only accepted ids present in `user.unlockedAvatars`, and
 * that column defaults to `['default']` and is only ever appended to by the
 * unlock route — which requires a price. So a free avatar could never be
 * equipped: the frontend catalogue offered it, the player clicked it, and the
 * server answered 403 "you have not unlocked this avatar yet". The only
 * selectable avatar was the one already active.
 *
 * Granting free avatars into every row on signup would have worked too, but it
 * writes the same constant into every account and needs a backfill migration
 * every time one is added. Keeping the free set in config means adding an avatar
 * is a one-line change and existing accounts pick it up immediately.
 *
 * Keep in sync with `apps/web/src/data/avatars.js`. An id the client shows but
 * this list omits is rejected — which is the correct direction for the mistake
 * to fail in, since the server decides what a player may equip.
 */
const FREE_AVATAR_IDS = new Set(['default', 'female']);

/**
 * Server-side price list for purchasable avatars.
 *
 * The catalogue itself lives in the frontend, but prices are authoritative here
 * so a client cannot name its own price. Ids absent from this map are not
 * purchasable.
 *
 * None of these currently ship an image in the frontend catalogue, so nothing
 * offers them yet; the unlock route stays functional for when they do.
 */
const AVATAR_PRICES = {
  'golden-engineer': 50,
  'neon-technician': 100,
  'void-keeper': 200,
};

/** Whether the player is allowed to equip this avatar. */
function canEquip(avatarId, user) {
  return FREE_AVATAR_IDS.has(avatarId) || user.unlockedAvatars.includes(avatarId);
}

/**
 * POST /api/users/me/avatars/:avatarId/unlock
 *
 * Debits VLT and unlocks the avatar atomically under a row lock. Previously the
 * ownership and balance checks ran outside the transaction, so two concurrent
 * requests could both pass and both `push` the same id — charging twice and
 * leaving a duplicated entry in `unlockedAvatars`.
 */
router.post(
  '/me/avatars/:avatarId/unlock',
  verifyAuthStrict,
  requireVerifiedEmail,
  economyLimiter,
  async (req, res) => {
    try {
      const { avatarId } = req.params;

      const price = AVATAR_PRICES[avatarId];
      if (price === undefined) {
        return res.status(400).json({ error: 'Invalid avatar or avatar is not purchasable' });
      }

      const outcome = await withUserLock(req.uid, async (tx, user) => {
        // Re-checked under the lock, so a concurrent unlock cannot slip past.
        if (user.unlockedAvatars.includes(avatarId)) {
          return { status: 400, body: { error: 'Avatar is already unlocked' } };
        }

        if (!canAfford(user.vltBalance, price)) {
          return {
            status: 400,
            body: {
              error: 'Insufficient VLT balance',
              required: price,
              balance: moneyToNumber(user.vltBalance),
            },
          };
        }

        const updated = await tx.user.update({
          where: { id: req.uid },
          data: {
            vltBalance: { decrement: money(price) },
            unlockedAvatars: { push: avatarId },
            avatarId, // auto-equip after unlock
          },
        });

        await tx.ledgerEntry.create({
          data: {
            userId: req.uid,
            kind: 'avatar-unlock',
            amount: money(price),
            reference: avatarId,
            quantity: 1,
            balanceAfter: updated.vltBalance,
          },
        });

        return {
          status: 200,
          body: {
            success: true,
            avatarId,
            newBalance: moneyToNumber(updated.vltBalance),
            unlockedAvatars: updated.unlockedAvatars,
          },
        };
      });

      return res.status(outcome.status).json(outcome.body);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Avatar unlock error:', err);
      return res.status(500).json({ error: 'Failed to unlock avatar' });
    }
  }
);

/**
 * PATCH /api/users/me/avatar — set the active avatar.
 * Body: { avatarId }
 *
 * No currency moves, but it still reads then writes, so it runs under the same
 * lock to stay consistent with a concurrent unlock.
 */
router.patch('/me/avatar', verifyAuthStrict, configLimiter, async (req, res) => {
  try {
    const { avatarId } = req.body;

    if (!avatarId || typeof avatarId !== 'string') {
      return res.status(400).json({ error: 'avatarId is required' });
    }

    const outcome = await withUserLock(req.uid, async (tx, user) => {
      // Free avatars need no unlock; anything else must have been bought.
      // Unknown ids fall through to this and are rejected, so a client cannot
      // store arbitrary strings in the column.
      if (!canEquip(avatarId, user)) {
        return {
          status: 403,
          body: {
            error: 'You have not unlocked this avatar yet',
            code: 'avatar/not-unlocked',
          },
        };
      }

      if (user.avatarId === avatarId) {
        return { status: 400, body: { error: 'This avatar is already active' } };
      }

      const updated = await tx.user.update({
        where: { id: req.uid },
        data: { avatarId },
      });

      return {
        status: 200,
        body: {
          success: true,
          avatarId: updated.avatarId,
          unlockedAvatars: updated.unlockedAvatars,
        },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Set avatar error:', err);
    return res.status(500).json({ error: 'Failed to set avatar' });
  }
});

export default router;
