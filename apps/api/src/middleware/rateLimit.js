/**
 * Rate limiters.
 *
 * ## Keying
 *
 * Limits are keyed by authenticated uid, falling back to IP for requests that
 * arrive without a verified session. Keying on uid matters because several
 * players legitimately share an IP (school, office, mobile CGNAT) and one
 * abusive account must not lock out the others.
 *
 * This only works because every per-route limiter is mounted **after**
 * `verifyAuth`/`verifyAuthStrict`. An earlier revision mounted them before, so
 * `req.auth` was always undefined and every limiter silently degraded to
 * IP-only keying — the opposite of what the code claimed. If you add a limiter
 * to a route, put the auth middleware first.
 *
 * The app-level `globalLimiter` is the exception: it deliberately runs before
 * authentication so unauthenticated floods are cut off before they reach token
 * verification, which costs a network call to Firebase.
 *
 * ## IP trust
 *
 * IP-keyed limits are only meaningful when `req.ip` cannot be forged. See
 * `TRUST_PROXY_HOPS` in config/env.js — with a permissive proxy setting a
 * client can rotate `X-Forwarded-For` and reset its own counter at will.
 */

import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/**
 * Normalises an IPv6 address to its /64 prefix.
 *
 * A single client is routinely handed a whole /64, so keying on the full
 * address lets one host cycle through billions of distinct keys.
 */
function normaliseIp(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip; // IPv4

  const groups = ip.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** Prefers the authenticated identity; falls back to the (normalised) address. */
function keyByUserOrIp(req) {
  if (req.auth?.uid) return `uid:${req.auth.uid}`;
  return `ip:${normaliseIp(req.ip)}`;
}

/** Consistent JSON shape so the frontend can surface a useful message. */
function limitHandler(message) {
  return (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : 60;

    res.status(429).json({
      error: message,
      code: 'rate-limit/exceeded',
      retryAfterSeconds,
    });
  };
}

/**
 * Rate limiting is disabled only for automated tests, and never in production.
 * The previous implementation gated just the global limiter, so setting this
 * flag left every per-route limiter active — misleading for anyone relying on it.
 */
export const limitersEnabled = env.isProduction || process.env.DISABLE_RATE_LIMITS !== 'true';

if (!limitersEnabled) {
  console.warn('[rate-limit] DISABLED via DISABLE_RATE_LIMITS — never do this outside tests');
}

/** No-op middleware used when limiters are switched off. */
const passthrough = (_req, _res, next) => next();

/**
 * Builds a limiter, or a no-op when disabled, so the flag applies uniformly.
 */
function makeLimiter({ windowMs, limit, message }) {
  if (!limitersEnabled) return passthrough;

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    handler: limitHandler(message),
    // No `validate` overrides: supplying a custom keyGenerator already opts out
    // of the library's IP-format checks, and `normaliseIp` covers the IPv6 case
    // those checks exist to warn about. Passing an unrecognised validation key
    // here makes express-rate-limit throw at construction time.
  });
}

/**
 * Broad ceiling for the whole API, mounted before authentication.
 * Generous enough that normal play (the dashboard polls every 8–10s) never
 * hits it, low enough to blunt floods.
 */
export const globalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  message: 'Too many requests. Please slow down.',
});

/** Account bootstrap — called once per login, so a low ceiling is safe. */
export const authSyncLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  message: 'Too many sign-in attempts. Please wait a few minutes.',
});

/**
 * Currency-moving routes: purchases and avatar unlocks.
 *
 * These are now also protected against concurrent abuse by a row lock (see
 * lib/userLock.js), so the limiter is about load rather than correctness.
 */
export const economyLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Too many transactions. Please wait a moment.',
});

/** Minigame plays. The route enforces a cooldown; this blunts request floods. */
export const minigameLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  message: 'Too many minigame attempts. Please wait a moment.',
});

/** Writes to mining allocation config — replaces all rows in a transaction. */
export const configLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  message: 'Too many configuration changes. Please wait a moment.',
});

export default globalLimiter;
