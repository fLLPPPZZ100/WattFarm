import { Router } from 'express';
import prisma from '../lib/prisma.js';
import verifyAuth from '../middleware/verifyAuth.js';

const router = Router();

// POST /api/auth/sync — create or update user in Postgres
router.post('/sync', verifyAuth, async (req, res) => {
  try {
    const user = await prisma.user.upsert({
      where: { id: req.uid },
      update: { email: req.email },
      create: {
        id: req.uid,
        email: req.email || '',
      },
    });

    res.json({ user });
  } catch (err) {
    console.error('Auth sync error:', err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

export default router;