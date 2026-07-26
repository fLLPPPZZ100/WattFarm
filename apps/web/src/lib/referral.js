/**
 * Client-side handling of an inbound invite code.
 *
 * The problem this solves: a player arrives at `/?ref=ABCD1234`, then registers.
 * Registration goes through Firebase, which knows nothing about our code, and
 * the account row is only created later by `POST /api/auth/sync`. The code has
 * to survive that gap — including a full page navigation, since Google sign-in
 * uses a redirect on mobile.
 *
 * So the code is parked in localStorage on arrival and sent with the first sync.
 * RollerCoin does the same thing with a cookie; localStorage is equivalent for a
 * same-origin SPA and is not sent on every request.
 */

const STORAGE_KEY = 'wattfarm.referral';

/** Query parameters accepted, in priority order. */
const PARAM_KEYS = ['ref', 'referral', 'r'];

/**
 * localStorage throws rather than returning null in Safari private browsing and
 * when a browser blocks storage entirely. A missing invite code is a minor
 * inconvenience; a crash on boot is not, so every access is guarded.
 */
function safeRead() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage unavailable — the code is simply lost */
  }
}

/**
 * Reads an invite code from the current URL, stores it, and removes it from the
 * address bar.
 *
 * Stripping the parameter matters for two reasons: the player might otherwise
 * copy their own URL and hand out somebody else's invite link, and leaving it
 * in place means it is re-applied on every reload.
 *
 * Safe to call more than once. Call it before the app renders.
 *
 * @returns {string | null} the captured code, if any
 */
export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return null;

  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }

  let found = null;
  for (const key of PARAM_KEYS) {
    const value = params.get(key);
    if (value) {
      found = value;
      break;
    }
  }

  if (!found) return safeRead();

  // Server-side `normaliseCode` is the authority on format; here we only trim
  // so an obviously oversized value cannot fill up storage.
  const trimmed = found.trim().slice(0, 64);
  safeWrite(trimmed);

  // Drop every accepted key, not just the one we used.
  for (const key of PARAM_KEYS) params.delete(key);

  const query = params.toString();
  const nextUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;

  try {
    window.history.replaceState(null, '', nextUrl);
  } catch {
    /* non-fatal: the parameter just stays visible */
  }

  return trimmed;
}

/** The pending invite code, if one is waiting to be sent to the API. */
export function getStoredReferralCode() {
  return safeRead();
}

/**
 * Forgets the pending code.
 *
 * Called after any successful sync, whether or not the code was honoured: it can
 * only ever apply to account creation, so once a sync has succeeded the code is
 * spent either way and keeping it would make it linger across sessions.
 */
export function clearStoredReferralCode() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Builds the shareable link for a code. */
export function buildInviteLink(code) {
  if (!code) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

export default { captureReferralFromUrl, getStoredReferralCode, clearStoredReferralCode };
