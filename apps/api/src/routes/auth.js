import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { verifyAuth } from '../middleware/verifyAuth.js';
import { authSyncLimiter } from '../middleware/rateLimit.js';
import { moneyToNumber } from '../lib/money.js';
import { generateReferralCode, normaliseReferralCode } from '../lib/referralCode.js';

const router = Router();

/** How many times to retry account creation after a referral code collision. */
const CODE_COLLISION_RETRIES = 5;

/**
 * Resolves a submitted referral code to the referrer's uid.
 *
 * ## Security notes
 *
 * - An unknown or malformed code resolves to `null` and registration continues
 *   without attribution. Rejecting the signup instead would let a stale or
 *   mistyped link block someone from creating an account entirely.
 * - Self-referral is checked explicitly. It should be impossible — a code is
 *   only minted *after* the row exists, so a brand new uid cannot already own
 *   one — but the check costs nothing and the alternative is an account earning
 *   commission on itself.
 * - Nothing about the outcome is echoed back beyond a boolean, so this cannot be
 *   used to test whether a given code exists. The response says whether *your*
 *   signup was attributed, not whether the code was real.
 *
 * @param {unknown} rawCode
 * @param {string} newUserId
 * @returns {Promise<string | null>} referrer uid, or null
 */
async function resolveReferrer(rawCode, newUserId) {
  const code = normaliseReferralCode(rawCode);
  if (!code) return null;

  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });

  if (!referrer) return null;
  if (referrer.id === newUserId) return null;

  return referrer.id;
}

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
    // The player's own invite code. Safe to expose: it is theirs to share, and
    // it carries no information about the account.
    referralCode: user.referralCode,
    // Whether this account was invited by someone. The referrer's identity is
    // deliberately not included — the invitee has no reason to learn who
    // profits from them, and it would be a way to probe accounts.
    wasReferred: Boolean(user.referredById),
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
    /**
     * Referral attribution is resolved only when there is no row yet, and is
     * passed only in the `create` branch below.
     *
     * That placement is the whole security model for attribution: `upsert` runs
     * `create` exactly once, so a returning player syncing for the hundredth
     * time — or an attacker replaying a sync with someone else's code — takes
     * the `update` path, which never touches `referredById`. A referral cannot
     * be added, changed or stolen after the account exists.
     */
    const existing = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true },
    });

    const referredById = existing ? null : await resolveReferrer(req.body?.referralCode, uid);

    let user = null;
    let lastError = null;

    // The referral code is unique, so creation can lose a race against another
    // account drawing the same 8 characters. Astronomically unlikely; retried
    // rather than surfaced, because there is nothing the player could do about
    // it.
    for (let attempt = 0; attempt < CODE_COLLISION_RETRIES; attempt += 1) {
      try {
        user = await prisma.user.upsert({
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
            // Only applied on create, so this is not a repeatable payout.
            vltBalance: STARTING_VLT,
            referralCode: generateReferralCode(),
            ...(referredById ? { referredById, referredAt: new Date() } : {}),
          },
        });
        break;
      } catch (err) {
        const isCodeCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          Array.isArray(err.meta?.target) &&
          err.meta.target.includes('referralCode');

        if (!isCodeCollision) throw err;

        lastError = err;
        console.warn(`[auth/sync] referral code collision, retrying (attempt ${attempt + 1})`);
      }
    }

    if (!user) throw lastError ?? new Error('Could not allocate a referral code');

    return res.json({
      user: serialiseUser(user),
      emailVerified,
      // Lets the signup UI confirm the invite was honoured. False also covers
      // "code was invalid" and "you already had an account", on purpose: the
      // client is told about its own outcome, not about the code.
      referralApplied: Boolean(referredById),
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
