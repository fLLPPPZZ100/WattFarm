/**
 * Authentication and authorisation middleware.
 *
 * Contract for downstream handlers:
 *   req.auth = { uid, email, emailVerified, provider, claims }
 *
 * `req.uid` / `req.email` are kept as aliases so existing route handlers keep
 * working, but new code should read from `req.auth`.
 */

import { adminAuth } from '../lib/firebaseAdmin.js';
import env from '../config/env.js';

/** Error codes returned to the client so the frontend can react precisely. */
export const AuthErrorCode = Object.freeze({
  MISSING_TOKEN: 'auth/missing-token',
  MALFORMED_TOKEN: 'auth/malformed-token',
  EXPIRED_TOKEN: 'auth/expired-token',
  REVOKED_TOKEN: 'auth/revoked-token',
  INVALID_TOKEN: 'auth/invalid-token',
  USER_DISABLED: 'auth/user-disabled',
  EMAIL_NOT_VERIFIED: 'auth/email-not-verified',
  VERIFICATION_UNAVAILABLE: 'auth/verification-unavailable',
});

/**
 * Extracts the bearer token, tolerating extra whitespace and mixed casing but
 * rejecting anything that is not a single well-formed `Bearer <token>` pair.
 *
 * @param {string | undefined} header raw Authorization header
 * @returns {{ token: string } | { error: string, message: string }}
 */
function extractBearerToken(header) {
  if (!header || typeof header !== 'string') {
    return {
      error: AuthErrorCode.MISSING_TOKEN,
      message: 'Authorization header is required.',
    };
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return {
      error: AuthErrorCode.MALFORMED_TOKEN,
      message: 'Authorization header must use the "Bearer <token>" scheme.',
    };
  }

  const token = match[1].trim();

  // A Firebase ID token is a JWT: three dot-separated segments. Rejecting
  // obvious garbage here avoids a pointless network call to Firebase.
  if (token.split('.').length !== 3) {
    return {
      error: AuthErrorCode.MALFORMED_TOKEN,
      message: 'Authorization token is not a valid JWT.',
    };
  }

  return { token };
}

/**
 * Maps a firebase-admin verification failure onto an HTTP response shape.
 * Distinguishing expiry from revocation matters: the client can silently
 * refresh an expired token, but a revoked one requires a full re-login.
 */
function describeVerificationError(err) {
  const code = err?.errorInfo?.code || err?.code || '';

  switch (code) {
    case 'auth/id-token-expired':
      return {
        status: 401,
        code: AuthErrorCode.EXPIRED_TOKEN,
        message: 'Session expired. Please refresh and try again.',
      };
    case 'auth/id-token-revoked':
    case 'auth/session-cookie-revoked':
      return {
        status: 401,
        code: AuthErrorCode.REVOKED_TOKEN,
        message: 'Session was revoked. Please log in again.',
      };
    case 'auth/user-disabled':
      return {
        status: 403,
        code: AuthErrorCode.USER_DISABLED,
        message: 'This account has been disabled.',
      };
    case 'auth/user-not-found':
      // Token signature was valid but the account no longer exists.
      return {
        status: 401,
        code: AuthErrorCode.INVALID_TOKEN,
        message: 'Account no longer exists. Please log in again.',
      };
    case 'auth/argument-error':
    case 'auth/invalid-id-token':
      return {
        status: 401,
        code: AuthErrorCode.MALFORMED_TOKEN,
        message: 'Authorization token could not be parsed.',
      };
    default:
      return {
        status: 401,
        code: AuthErrorCode.INVALID_TOKEN,
        message: 'Invalid authentication token.',
      };
  }
}

/**
 * Builds the auth middleware.
 *
 * @param {object} [options]
 * @param {boolean} [options.checkRevoked] ask Firebase whether the token was
 *   revoked. Costs one extra round trip, so it is reserved for routes that
 *   mutate state or move currency.
 */
function createVerifyAuth({ checkRevoked = false } = {}) {
  return async function verifyAuth(req, res, next) {
    const extracted = extractBearerToken(req.headers.authorization);

    if (extracted.error) {
      return res.status(401).json({
        error: extracted.message,
        code: extracted.error,
      });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(extracted.token, checkRevoked);

      req.auth = {
        uid: decoded.uid,
        // Firebase omits `email` for some providers (e.g. anonymous, phone).
        // Normalise to null rather than an empty string so the database can
        // hold a proper NULL and the unique index stays usable.
        email: decoded.email || null,
        emailVerified: decoded.email_verified === true,
        provider: decoded.firebase?.sign_in_provider || 'unknown',
        claims: decoded,
      };

      // Backwards-compatible aliases for existing route handlers.
      req.uid = decoded.uid;
      req.email = req.auth.email;

      return next();
    } catch (err) {
      const { status, code, message } = describeVerificationError(err);

      // Log the real cause server-side; never leak SDK internals to clients.
      if (code === AuthErrorCode.INVALID_TOKEN) {
        console.warn('[auth] token verification failed:', err?.errorInfo?.code || err?.message);
      }

      return res.status(status).json({ error: message, code });
    }
  };
}

/**
 * Standard authentication. Verifies the token signature, issuer, audience and
 * expiry locally without contacting Firebase — suitable for read-only routes.
 */
export const verifyAuth = createVerifyAuth({ checkRevoked: false });

/**
 * Strict authentication for state-changing routes. Additionally confirms with
 * Firebase that the token has not been revoked, closing the window where a
 * logged-out or disabled user could keep acting for up to an hour.
 */
export const verifyAuthStrict = createVerifyAuth({
  checkRevoked: env.CHECK_REVOKED_TOKENS,
});

/**
 * Requires a verified email address.
 *
 * Without this, anyone could register using somebody else's address and start
 * accumulating or spending currency. Applied to economy routes only, so an
 * unverified user can still browse and configure their farm.
 *
 * Accounts from federated providers that vouch for the address (Google) arrive
 * already verified, so this is transparent for them.
 */
export function requireVerifiedEmail(req, res, next) {
  if (!env.REQUIRE_VERIFIED_EMAIL) return next();

  if (!req.auth) {
    // Programming error: this middleware must be mounted after verifyAuth.
    console.error('[auth] requireVerifiedEmail used without a preceding verifyAuth');
    return res.status(500).json({
      error: 'Server misconfiguration.',
      code: AuthErrorCode.VERIFICATION_UNAVAILABLE,
    });
  }

  if (req.auth.emailVerified) return next();

  return res.status(403).json({
    error: 'Please verify your email address before using this feature.',
    code: AuthErrorCode.EMAIL_NOT_VERIFIED,
    email: req.auth.email,
  });
}

// Default export preserved so existing `import verifyAuth from '...'` keeps working.
export default verifyAuth;
