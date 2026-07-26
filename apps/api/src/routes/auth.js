import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { authSyncLimiter } from '../middleware/rateLimit.js';
import { moneyToNumber } from '../lib/money.js';

const router = Router();

/**
 * Shapes the user row for the client. Keeps the response explicit so adding a
 * column to the schema never accidentally exposes it through this endpoint.
 */
function serialiseUser(user) {
  return {
    id: user.id,
    email: user.email,
    // vltBalance is Decimal in the database; emit a JSON number so the
    // frontend contract is unchanged. See lib/money.js.
    vltBalance: moneyToNumber(user.vltBalance),
    avatarId: user.avatarId,
    unlockedAvatars: user.unlockedAvatars,
    createdAt: user.createdAt,
  };
}

/**
 * POST /api/auth/sync — idempotently mirrors the Firebase account into Postgres.
 *
 * The frontend awaits this before considering the session ready, so a failure
 * here must be reported honestly rather than swallowed: a user without a row
 * cannot buy, earn or spend anything, and silently continuing produced
 * confusing 404s on every later action.
 */
router.post('/sync', verifyAuth, authSyncLimiter, async (req, res) => {
  const { uid, email, emailVerified } = req.auth;

  try {
    const user = await prisma.user.upsert({
      where: { id: uid },
      // Only write the email when Firebase actually provided one, so a
      // provider that omits it cannot blank out a previously known address.
      update: email ? { email } : {},
      create: {
        id: uid,
        // Explicit null (not '') — the column is uniquely indexed, and Postgres
        // permits many NULLs but only one ''. The old default collided as soon
        // as a second account without an email was created.
        email: email ?? null,
      },
    });

    return res.json({
      user: serialiseUser(user),
      emailVerified,
    });
  } catch (err) {
    // Unique constraint violation: the address already belongs to a different
    // uid. This happens when someone registers with a password and later signs
    // in with Google (or vice versa) and Firebase issues a distinct uid.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.warn(`[auth/sync] email collision for uid=${uid}`);
      return res.status(409).json({
        error:
          'This email is already linked to another sign-in method. ' +
          'Please log in using the method you originally registered with.',
        code: 'auth/email-already-linked',
      });
    }

    console.error('[auth/sync] failed:', err);
    return res.status(500).json({
      error: 'Could not prepare your account. Please try again.',
      code: 'auth/sync-failed',
    });
  }
});

/**
 * GET /api/auth/me — current account state.
 *
 * Lets the frontend confirm the backend row exists without mutating anything,
 * which the session bootstrap uses to detect a half-provisioned account.
 */
router.get('/me', verifyAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.uid } });

    if (!user) {
      return res.status(404).json({
        error: 'Account has not been provisioned yet.',
        code: 'auth/not-provisioned',
      });
    }

    return res.json({
      user: serialiseUser(user),
      emailVerified: req.auth.emailVerified,
      provider: req.auth.provider,
    });
  } catch (err) {
    console.error('[auth/me] failed:', err);
    return res.status(500).json({ error: 'Failed to load account.', code: 'auth/me-failed' });
  }
});

export default router;
