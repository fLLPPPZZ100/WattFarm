/**
 * Capturing a referral code from the invite link.
 *
 * ## Why the code is stashed instead of read at signup time
 *
 * An invite lands on `/login?r=CODE`, but the code is not needed until
 * `POST /api/auth/sync`, which happens after Firebase resolves the session. In
 * between, the page can navigate (login ↔ register) and — with Google sign-in on
 * mobile — the browser leaves the site entirely and comes back via a redirect.
 * Reading `window.location` at sync time would therefore find nothing.
 *
 * `sessionStorage` survives that round trip and is scoped to the tab, so a code
 * captured in one tab cannot attach itself to a signup happening in another.
 * It also expires on its own when the tab closes, which is the behaviour we
 * want: a link clicked days ago should not silently attribute a much later
 * registration.
 */

const STORAGE_KEY = 'wattfarm.referralCode';

/** Query parameter carried by invite links, matching the format in the brief. */
const QUERY_PARAM = 'r';

/** Mirrors the server's accepted format (see api/src/lib/referralCode.js). */
const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

/**
 * `sessionStorage` throws in Safari's private mode and when storage is
 * disabled, and it is not worth breaking sign-in over. Referral attribution is
 * a nice-to-have; authentication is not.
 */
function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Validates and normalises a code the same way the server does, so an obviously
 * bad value never reaches the network.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normaliseReferralCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * Reads `?r=` from the current URL and remembers it for the pending signup.
 *
 * Call once at boot, before the router renders. Returns the stored code, if any,
 * so callers can show "you were invited" messaging.
 *
 * The parameter is removed from the address bar afterwards via `replaceState`:
 * it has been captured, and leaving it in place means it survives into every
 * link the player copies out of the app, silently re-attributing other people's
 * signups to whoever invited them.
 *
 * @returns {string | null}
 */
export function captureReferralCode() {
  const storage = safeStorage();

  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = normaliseReferralCode(params.get(QUERY_PARAM));

  if (fromUrl) {
    storage?.setItem(STORAGE_KEY, fromUrl);

    params.delete(QUERY_PARAM);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash
    );

    return fromUrl;
  }

  return getStoredReferralCode();
}

/**
 * The code captured earlier in this tab, if it is still valid.
 *
 * Re-validated on read: `sessionStorage` is writable from the console, and this
 * value is sent to an endpoint that attributes currency, so it is treated as
 * untrusted input on the way out as well as on the way in. The server validates
 * it again regardless.
 *
 * @returns {string | null}
 */
export function getStoredReferralCode() {
  const storage = safeStorage();
  if (!storage) return null;

  return normaliseReferralCode(storage.getItem(STORAGE_KEY));
}

/**
 * Forgets the pending code.
 *
 * Called once the server has answered the sync, whether or not the code was
 * honoured. Keeping it would mean re-sending a code the server already refused
 * on every subsequent sync, and — if the player signs out and a different person
 * registers in the same tab — attributing that unrelated signup too.
 */
export function clearStoredReferralCode() {
  safeStorage()?.removeItem(STORAGE_KEY);
}

/**
 * The shareable invite URL for a code.
 *
 * Built from the running origin rather than a configured base URL: the link has
 * to work on whatever host the player is actually using, including previews and
 * local development.
 *
 * @param {string} code
 * @returns {string}
 */
export function buildReferralLink(code) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/login?${QUERY_PARAM}=${encodeURIComponent(code)}`;
}

export { QUERY_PARAM, STORAGE_KEY };
