import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { authSyncLimiter } from '../middleware/rateLimit.js';
import { moneyToNumber, roundMoney } from '../lib/money.js';
import { SIGNUP_BONUS_VLT } from '../config/referral.js';
import { ensureReferralCode, recordSignupBonus, resolveReferrer } from '../services/referral.js';

const router = Router();

/**
 * Shapes the user row for the client. Keeps the response explicit so adding a
 * column to the schema never accidentally exposes it through this endpoint.
 */
/**
 * Balance granted to a brand-new account.
 *
 * The payout is now a share of the network — `rate / (rate + baseline)` — which
 * is zero when nothing is placed. Without seed capital a new player would earn
 * nothing forever and could never buy their first panel, since the only other
 * income is the minigame loot table, which pays nothing 98.65% of the time.
 *
 * 50 VLT buys two mount-and-panel pairs (25 each), so the farm starts producing
 * immediately and the player has a real first decision to make.
 */
const STARTING_VLT = 50;

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
    referralCode: user.referralCode ?? null,
  };
}

/**
 * Creates the account row, applying a referral if one came with the request.
 *
 * This is the *only* place `referredById` is ever written. Attribution has to
 * happen here, at creation, because it must not be changeable later: an account
 * that could be re-pointed at a new referrer would let someone build up a farm
 * and then sell its earnings history to the highest bidder. Confining the write
 * to creation also makes referral cycles impossible without a cycle check — the
 * referrer already exists, so it cannot be downstream of this row.
 *
 * Balance and audit row are written in one transaction, so a crash cannot leave
 * a bonus credited with no record of why.
 */
async function createAccount({ uid, email, rawReferralCode }) {
  return prisma.$transaction(async (tx) => {
    const { referrerId, reason } = await resolveReferrer({
      newUserId: uid,
      rawCode: rawReferralCode,
      client: tx,
    });

    // The joining bonus goes to the person joining, not the referrer. That
    // asymmetry is deliberate — see config/referral.js.
    const bonus = referrerId ? SIGNUP_BONUS_VLT : 0;

    const user = await tx.user.create({
      data: {
        id: uid,
        // Explicit null (not '') — the column is uniquely indexed, and Postgres
        // permits many NULLs but only one ''. The old default collided as soon
        // as a second account without an email was created.
        email: email ?? null,
        // Only applied on create, so this is not a repeatable payout.
        vltBalance: roundMoney(STARTING_VLT + bonus),
        referredById: referrerId,
      },
    });

    if (referrerId) {
      await recordSignupBonus(tx, { referrerId, referredId: uid });
    }

    return {
      user,
      referral: referrerId
        ? { applied: true, bonus }
        : { applied: false, reason },
    };
  });
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
  const rawReferralCode = req.body?.referralCode;

  try {
    /**
     * Read-then-create rather than `upsert`, because the referral has to be
     * applied only to a brand-new row and `upsert` cannot tell the caller
     * whether it inserted or updated. The concurrent-sync race this opens is
     * handled by the P2002-on-id branch below.
     */
    let user = await prisma.user.findUnique({ where: { id: uid } });
    let referral = null;

    if (!user) {
      const created = await createAccount({ uid, email, rawReferralCode });
      user = created.user;
      referral = created.referral;
    } else if (email && user.email !== email) {
      // Only write the email when Firebase actually provided one, so a
      // provider that omits it cannot blank out a previously known address.
      user = await prisma.user.update({ where: { id: uid }, data: { email } });
    }

    // Issued lazily so accounts created before the programme existed get a code
    // the first time they sign in, with no data migration.
    if (!user.referralCode) {
      user = { ...user, referralCode: await ensureReferralCode(uid) };
    }

    return res.json({
      user: serialiseUser(user),
      emailVerified,
      // Lets the client confirm an invite was honoured, or explain why it was
      // not, instead of silently dropping a code the player pasted.
      referral,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target : [];

      /**
       * Two syncs for the same uid arrived together and both saw no row. The
       * loser simply reads the winner's row: the account exists, which is all
       * the caller asked for. The referral is not retried — the winning
       * transaction already decided it.
       */
      if (target.includes('id')) {
        const existing = await prisma.user.findUnique({ where: { id: uid } });
        if (existing) {
          return res.json({ user: serialiseUser(existing), emailVerified, referral: null });
        }
      }

      // Unique constraint on email: the address already belongs to a different
      // uid. This happens when someone registers with a password and later signs
      // in with Google (or vice versa) and Firebase issues a distinct uid.
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
