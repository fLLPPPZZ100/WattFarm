/**
 * Rate limiters.
 *
 * The API previously had none, leaving the economy endpoints open to trivial
 * scripted abuse (minigame farming, avatar unlock spam) and the sync endpoint
 * open to request floods.
 *
 * Limits are keyed by authenticated uid where available, falling back to IP.
 * Keying on uid matters because several players can legitimately share an IP
 * (school, office, mobile CGNAT) and one abusive account should not lock out
 * the others.
 */

import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/** Uses the authenticated uid when present so limits follow the account, not the network. */
function keyByUserOrIp(req) {
  return req.auth?.uid ? `uid:${req.auth.uid}` : `ip:${req.ip}`;
}

/** Consistent JSON shape so the frontend can surface a useful message. */
function limitHandler(message) {
  return (req, res) => {
    const retryAfterSeconds = Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000) || 60;
    res.status(429).json({
      error: message,
      code: 'rate-limit/exceeded',
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    });
  };
}

const shared = {
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  // Trusting req.ip requires `app.set('trust proxy', ...)` to be correct.
  // index.js configures it for the single-proxy hosting setup.
  keyGenerator: keyByUserOrIp,
};

/**
 * Broad ceiling for the whole API. Generous enough that normal play (the
 * dashboard polls every 8–10s) never hits it, low enough to blunt floods.
 */
export const globalLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 300,
  handler: limitHandler('Too many requests. Please slow down.'),
});

/**
 * Account bootstrap. Called once per login, so a low ceiling is safe.
 * Keyed by IP because the uid is available but the endpoint is the very first
 * authenticated call — an attacker replaying tokens would still be capped.
 */
export const authSyncLimiter = rateLimit({
  ...shared,
  windowMs: 5 * 60 * 1000,
  limit: 30,
  handler: limitHandler('Too many sign-in attempts. Please wait a few minutes.'),
});

/**
 * Currency-moving routes: purchases and avatar unlocks.
 * Real users click these a handful of times per minute at most.
 */
export const economyLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 30,
  handler: limitHandler('Too many transactions. Please wait a moment.'),
});

/**
 * Minigame plays. The route already enforces a per-game cooldown, but that
 * check runs several database queries first — this limiter rejects floods
 * before they reach the database.
 */
export const minigameLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 20,
  handler: limitHandler('Too many minigame attempts. Please wait a moment.'),
});

/**
 * Writes to mining allocation config. Each save replaces all rows in a
 * transaction, so it is comparatively expensive.
 */
export const configLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 20,
  handler: limitHandler('Too many configuration changes. Please wait a moment.'),
});

/**
 * Disabling limiters wholesale in development would hide bugs, so they stay
 * on everywhere. This escape hatch exists only for automated tests.
 */
export const limitersEnabled = process.env.DISABLE_RATE_LIMITS !== 'true' || env.isProduction;

export default globalLimiter;
