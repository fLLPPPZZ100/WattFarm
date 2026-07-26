/**
 * Referral programme endpoints.
 *
 * There is deliberately no route that *sets* a referrer. Attribution happens
 * exactly once, inside `POST /api/auth/sync`, when the account row is created.
 * Exposing a "claim my referrer" endpoint would reintroduce the farming hole
 * that immutability closes.
 */

import { Router } from 'express';

import { verifyAuth } from '../middleware/verifyAuth.js';
import { referralLookupLimiter } from '../middleware/rateLimit.js';
import { publicConfig } from '../config/referral.js';
import { findReferrerByCode, getReferralSummary, normaliseCode } from '../services/referral.js';

const router = Router();

/**
 * GET /api/referral — the signed-in player's programme state.
 *
 * Returns the invite code (generating one on first call), current tier, totals,
 * and the list of accepted invites with emails partially masked.
 */
router.get('/', verifyAuth, async (req, res) => {
  try {
    const summary = await getReferralSummary(req.auth.uid);

    return res.json({
      ...summary,
      // Shipped alongside so the UI can render the tier ladder and the
      // qualification threshold without keeping its own copy of the numbers.
      config: publicConfig(),
    });
  } catch (err) {
    console.error('[referral] summary failed:', err);
    return res.status(500).json({
      error: 'Could not load your referral data.',
      code: 'referral/summary-failed',
    });
  }
});

/**
 * GET /api/referral/check?code=XXXXXXXX — is this code usable?
 *
 * Unauthenticated on purpose: the registration form needs to tell the player
 * their invite code is valid *before* the account exists. It reveals only
 * whether a code resolves, never whose it is — returning the owner would turn
 * the endpoint into a way to map codes to accounts.
 */
router.get('/check', referralLookupLimiter, async (req, res) => {
  const code = normaliseCode(req.query?.code);

  if (!code) {
    return res.json({ valid: false, reason: 'malformed' });
  }

  try {
    const referrer = await findReferrerByCode(code);
    return res.json({
      valid: referrer !== null,
      reason: referrer ? null : 'unknown',
      // Echo the cleaned form so the client can show what will actually be sent.
      code,
    });
  } catch (err) {
    console.error('[referral] code check failed:', err);
    return res.status(500).json({
      error: 'Could not check that code.',
      code: 'referral/check-failed',
    });
  }
});

export default router;
