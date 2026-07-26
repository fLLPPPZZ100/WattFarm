/**
 * The single HTTP client for authenticated API calls.
 *
 * Replaces four near-identical `fetchWithAuth` helpers (assetsStore, Wallet,
 * Profile, AvatarPicker) that each handled errors differently and none of
 * which handled 401. Consequences of that duplication:
 *   - an expired token surfaced as a generic "Failed to fetch"
 *   - a revoked session left the UI in a broken half-logged-in state
 *   - error messages from the API were sometimes discarded
 */

import { auth } from '../firebase.js';
import { API_URL } from '../config/env.js';

/** Error codes the backend returns that mean "the session is unusable". */
const TERMINAL_AUTH_CODES = new Set([
  'auth/revoked-token',
  'auth/invalid-token',
  'auth/malformed-token',
  'auth/missing-token',
  'auth/user-disabled',
]);

/**
 * Structured error so callers can branch on cause instead of matching strings.
 */
export class ApiError extends Error {
  constructor(message, { status, code, retryAfterSeconds, payload } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? null;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
    this.payload = payload ?? null;
  }

  /** Network failure, CORS rejection, or the API being unreachable. */
  get isNetworkError() {
    return this.status === 0;
  }

  /** The session cannot be recovered by refreshing — the user must log in again. */
  get isSessionExpired() {
    return this.status === 401 && TERMINAL_AUTH_CODES.has(this.code);
  }

  /** Email verification gate on economy routes. */
  get isEmailUnverified() {
    return this.status === 403 && this.code === 'auth/email-not-verified';
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

/**
 * Subscribers notified when the session becomes unusable, so the app can route
 * to /login once instead of every caller implementing its own redirect.
 */
const sessionExpiredHandlers = new Set();

export function onSessionExpired(handler) {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

function notifySessionExpired(error) {
  for (const handler of sessionExpiredHandlers) {
    try {
      handler(error);
    } catch (err) {
      console.error('[apiClient] session-expired handler threw:', err);
    }
  }
}

/**
 * Resolves a fresh ID token.
 *
 * Reads `auth.currentUser` rather than closing over React state, so it can
 * never serve a stale user. Firebase caches the token internally and only
 * performs a network refresh when it is close to expiry, so `forceRefresh`
 * is reserved for the explicit retry after a 401.
 */
async function getIdToken({ forceRefresh = false } = {}) {
  const user = auth?.currentUser;
  if (!user) {
    throw new ApiError('You are not signed in.', {
      status: 401,
      code: 'auth/missing-token',
    });
  }
  return user.getIdToken(forceRefresh);
}

/** Parses the body defensively — error responses are not always JSON. */
async function parseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    return text ? { error: text } : {};
  }
  return response.json().catch(() => ({}));
}

function toApiError(response, body) {
  return new ApiError(body?.error || `Request failed with status ${response.status}`, {
    status: response.status,
    code: body?.code ?? null,
    retryAfterSeconds: body?.retryAfterSeconds ?? null,
    payload: body,
  });
}

/**
 * Performs an authenticated request against the API.
 *
 * @param {string} path path beginning with `/`, e.g. `/api/assets/mine`
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {unknown} [options.body] serialised as JSON when present
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.auth] set false for public endpoints
 * @returns {Promise<any>} parsed JSON response
 * @throws {ApiError}
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, signal, auth: useAuth = true, _isRetry = false } = options;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (useAuth) {
    // Force a refresh on the retry pass so an expired token is replaced
    // rather than resent.
    const token = await getIdToken({ forceRefresh: _isRetry });
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Preserve cancellation so callers can ignore it in cleanup functions.
    if (err?.name === 'AbortError') throw err;

    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      { status: 0, code: 'network/unreachable' }
    );
  }

  if (response.ok) {
    // 204 and other empty responses would make .json() throw.
    if (response.status === 204) return null;
    return parseBody(response);
  }

  const body_ = await parseBody(response);
  const error = toApiError(response, body_);

  /**
   * A 401 from an expired token is recoverable: Firebase can mint a new one.
   * Retry exactly once to avoid a loop when the token is genuinely rejected.
   */
  const canRetry =
    useAuth && !_isRetry && response.status === 401 && error.code === 'auth/expired-token';

  if (canRetry) {
    return apiRequest(path, { ...options, _isRetry: true });
  }

  // Anything else that invalidates the session gets broadcast so the app can
  // redirect to the login screen from one place.
  if (error.isSessionExpired || (response.status === 401 && _isRetry)) {
    notifySessionExpired(error);
  }

  throw error;
}

/** Convenience wrappers. */
export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
};

export default api;
