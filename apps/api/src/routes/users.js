import { Router } from 'express';
import prisma from '../lib/prisma.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = Router();

// POST /api/users/me/avatars/:avatarId/unlock
// Validates the avatar exists, is vlt type, debits VLT, and adds to unlockedAvatars
router.post('/me/avatars/:avatarId/unlock', verifyAuth, async (req, res) => {
  try {
    const { avatarId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: req.uid } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already unlocked
    if (user.unlockedAvatars.includes(avatarId)) {
      return res.status(400).json({ error: 'Avatar is already unlocked' });
    }

    // Check if already active
    if (user.avatarId === avatarId) {
      return res.status(400).json({ error: 'Avatar is already your active avatar' });
    }

    // Validate avatar exists in catalog
    // Avatar catalog lives on the frontend, but we validate price server-side
    const AVATAR_PRICES = {
      'golden-engineer': 50,
      'neon-technician': 100,
      'void-keeper': 200,
    };

    const price = AVATAR_PRICES[avatarId];
    if (price === undefined) {
      return res.status(400).json({ error: 'Invalid avatar or avatar is not purchasable' });
    }

    // Check VLT balance
    if (user.vltBalance < price) {
      return res.status(400).json({
        error: 'Insufficient VLT balance',
        required: price,
        balance: user.vltBalance,
      });
    }

    // Atomic transaction: debit VLT + unlock avatar
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: req.uid },
        data: {
          vltBalance: { decrement: price },
          unlockedAvatars: { push: avatarId },
          avatarId: avatarId, // auto-equip after unlock
        },
      });
      return u;
    });

    res.json({
      success: true,
      avatarId,
      newBalance: updatedUser.vltBalance,
      unlockedAvatars: updatedUser.unlockedAvatars,
    });
  } catch (err) {
    console.error('Avatar unlock error:', err);
    res.status(500).json({ error: 'Failed to unlock avatar' });
  }
});

// PATCH /api/users/me/avatar
// Receives { avatarId }, validates it's in unlockedAvatars, sets as active
router.patch('/me/avatar', verifyAuth, async (req, res) => {
  try {
    const { avatarId } = req.body;

    if (!avatarId) {
      return res.status(400).json({ error: 'avatarId is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.uid } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user owns this avatar
    if (!user.unlockedAvatars.includes(avatarId)) {
      return res.status(403).json({ error: 'You have not unlocked this avatar yet' });
    }

    // Check if already active
    if (user.avatarId === avatarId) {
      return res.status(400).json({ error: 'This avatar is already active' });
    }

    // Update active avatar
    const updatedUser = await prisma.user.update({
      where: { id: req.uid },
      data: { avatarId },
    });

    res.json({
      success: true,
      avatarId: updatedUser.avatarId,
      unlockedAvatars: updatedUser.unlockedAvatars,
    });
  } catch (err) {
    console.error('Set avatar error:', err);
    res.status(500).json({ error: 'Failed to set avatar' });
  }
});

export default router;