/**
 * Maps Firebase auth error codes to messages shown to players.
 *
 * Kept out of the UI components so login, registration and password reset all
 * speak with one voice, and so the copy can be reviewed in one place.
 *
 * Deliberate choice on account enumeration: for the login form we do *not*
 * distinguish "no such account" from "wrong password". Firebase itself returns
 * `auth/invalid-credential` for both in recent versions, and revealing which
 * emails are registered is a privacy leak. Registration necessarily reveals it
 * (the address is already taken), so there we are specific.
 */

const MESSAGES = {
  // Credentials
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',

  // Registration
  'auth/email-already-in-use': 'This email is already registered. Try signing in.',
  'auth/weak-password': 'Password too weak. Use at least 8 characters.',

  // Account state
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/requires-recent-login': 'For security, sign in again to continue.',

  // Rate limiting / abuse
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes before trying again.',

  // Network
  'auth/network-request-failed':
    'Connection failed. Check your internet and try again.',

  // Google / popup flows
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'A sign-in attempt is already in progress.',
  'auth/popup-blocked':
    'Your browser blocked the sign-in window. Allow pop-ups and try again.',
  'auth/account-exists-with-different-credential':
    'An account with this email already exists using a different sign-in method.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact support.',
  'auth/unauthorized-domain': 'This domain is not authorised in Firebase Auth.',

  // Password reset
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/invalid-action-code': 'This link is invalid or has already been used.',

  // Configuration problems — these mean the developer has work to do, so the
  // message says so plainly instead of blaming the player.
  'auth/invalid-api-key': 'Invalid Firebase configuration (VITE_FIREBASE_API_KEY).',
  'auth/configuration-not-found':
    'This sign-in method is not configured in the Firebase console.',
  'auth/internal-error': 'Something went wrong on our end. Please try again.',
};

/** Backend error codes surfaced through ApiError during provisioning. */
const API_MESSAGES = {
  'auth/email-already-linked':
    'This email is already linked to another sign-in method. Sign in with the method you registered with.',
  'auth/sync-failed': 'Could not prepare your account. Please try again.',
  'auth/email-not-verified': 'Verify your email to unlock this action.',
  'auth/revoked-token': 'Your session was ended. Please sign in again.',
  'auth/expired-token': 'Your session expired. Please sign in again.',
  'rate-limit/exceeded': 'Too many requests. Please wait a moment.',
  'network/unreachable': 'Could not reach the server.',
};

/**
 * Converts any thrown auth/API error into a player-facing message.
 *
 * @param {unknown} error a Firebase error, an ApiError, or anything else
 * @returns {string} message safe to render
 */
export function friendlyAuthError(error) {
  if (!error) return 'Ocorreu um erro inesperado. Tente novamente.';

  // ApiError from our backend carries a `code` we control.
  if (error.code && API_MESSAGES[error.code]) return API_MESSAGES[error.code];

  // Firebase errors expose `code` directly.
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];

  // Some Firebase paths only embed the code in the message string.
  const haystack = String(error.code || error.message || error);
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (haystack.includes(code)) return message;
  }
  for (const [code, message] of Object.entries(API_MESSAGES)) {
    if (haystack.includes(code)) return message;
  }

  // Our own ApiError instances already carry readable text from the server.
  if (error.name === 'ApiError' && error.message) return error.message;

  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/**
 * Scores password strength for the registration meter.
 *
 * Intentionally simple and transparent: length dominates, with modest credit
 * for character variety. This is guidance for the player, not the security
 * boundary — the minimum length is enforced separately on submit.
 *
 * @param {string} password
 * @returns {{ score: 0|1|2|3|4, label: string, hint: string }}
 */
export function scorePassword(password) {
  const value = password || '';

  if (value.length === 0) {
    return { score: 0, label: '', hint: '' };
  }

  if (value.length < 8) {
    return { score: 1, label: 'Too short', hint: 'Use at least 8 characters.' };
  }

  let points = 0;
  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;

  // Common weak patterns cancel out length credit.
  if (/^(.)\1+$/.test(value)) points = 1; // all one character
  // `senha` is Portuguese for "password" and stays in the list despite the
  // English-only rule: this is a blocklist of what people actually type, not
  // copy. Players are largely Portuguese-speaking, so dropping it would let a
  // genuinely weak password score well.
  if (/^(12345678|password|senha|qwerty|abc123)/i.test(value)) points = 1;

  if (points <= 2) return { score: 2, label: 'Weak', hint: 'Mix letters, numbers and symbols.' };
  if (points <= 4) return { score: 3, label: 'Good', hint: 'More variety would make it stronger.' };
  return { score: 4, label: 'Strong', hint: 'Strong password.' };
}

export default friendlyAuthError;
