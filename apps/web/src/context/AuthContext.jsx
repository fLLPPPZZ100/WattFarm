import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  reload,
} from 'firebase/auth';

import { auth, googleProvider, persistenceReady } from '../firebase.js';
import { api, ApiError, onSessionExpired } from '../lib/apiClient.js';

const AuthContext = createContext(null);

/**
 * Session lifecycle.
 *
 * `initialising` exists because Firebase restores the session asynchronously
 * from IndexedDB. Previously the provider reported `user: null` during that
 * window, so every reload flashed the logged-out UI before correcting itself.
 *
 * `provisioning` covers the backend sync. The old implementation set the user
 * *before* awaiting `/api/auth/sync`, so consumers began fetching immediately
 * and hit endpoints for an account row that did not exist yet — the dashboard
 * silently showed a 0 balance and purchases failed with "User not found".
 */
export const SessionStatus = Object.freeze({
  INITIALISING: 'initialising',
  SIGNED_OUT: 'signed-out',
  PROVISIONING: 'provisioning',
  READY: 'ready',
  PROVISION_FAILED: 'provision-failed',
});

/** Detects environments where a sign-in popup is unreliable. */
function shouldUseRedirect() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  // In-app browsers (Instagram, Facebook, TikTok, Line) block popups outright.
  const inAppBrowser = /\b(FBAN|FBAV|Instagram|Line|TikTok|WebView)\b/i.test(ua);

  // iOS Safari and most mobile browsers frequently suppress popups triggered
  // outside a very tight user-gesture window.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  // Installed PWAs have no popup surface at all.
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;

  return inAppBrowser || isStandalone || isMobile;
}

/** Exponential backoff with jitter, so a transient API outage recovers on its own. */
function backoffDelay(attempt) {
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return base + Math.random() * 250;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null); // backend row (balance, avatars…)
  const [status, setStatus] = useState(SessionStatus.INITIALISING);
  const [provisionError, setProvisionError] = useState(null);

  /**
   * Firebase mutates its `User` object in place, so `setUser(sameUser)` is a
   * no-op for React. Bumping this counter forces consumers to re-read mutated
   * fields such as `emailVerified` after `reload()`.
   */
  const [userVersion, setUserVersion] = useState(0);

  /**
   * Guards against a stale async sync applying after a newer auth event.
   * Without this, logging out mid-sync could resurrect the previous session.
   */
  const syncGenerationRef = useRef(0);
  const retryTimerRef = useRef(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /**
   * Mirrors the Firebase account into our database and only then marks the
   * session ready. Retries transient failures; surfaces terminal ones.
   */
  const provision = useCallback(
    async (firebaseUser, generation, attempt = 0) => {
      try {
        const data = await api.post('/api/auth/sync');

        // A newer auth event superseded this one — discard the result.
        if (generation !== syncGenerationRef.current) return;

        setAccount(data.user ?? null);
        setProvisionError(null);
        setStatus(SessionStatus.READY);
      } catch (err) {
        if (generation !== syncGenerationRef.current) return;

        const isApiError = err instanceof ApiError;

        // Email already tied to another sign-in method, disabled account, etc.
        // Retrying cannot help, so stop and report.
        const isTerminal =
          isApiError && (err.status === 409 || err.status === 403 || err.isSessionExpired);

        // Transient: network blips, cold starts, 500s, rate limiting.
        const isRetryable = !isTerminal && (!isApiError || err.isNetworkError || err.status >= 500 || err.isRateLimited);

        if (isRetryable && attempt < 4) {
          const delay = err instanceof ApiError && err.retryAfterSeconds
            ? err.retryAfterSeconds * 1000
            : backoffDelay(attempt);

          retryTimerRef.current = setTimeout(() => {
            provision(firebaseUser, generation, attempt + 1);
          }, delay);
          return;
        }

        console.error('[auth] account provisioning failed:', err);
        setProvisionError(
          isApiError
            ? err
            : new ApiError('Could not prepare your account. Please try again.', { status: 0 })
        );
        setStatus(SessionStatus.PROVISION_FAILED);
      }
    },
    []
  );

  /** Lets the UI offer a "try again" button when provisioning failed. */
  const retryProvisioning = useCallback(() => {
    const current = auth?.currentUser;
    if (!current) return;

    clearRetryTimer();
    syncGenerationRef.current += 1;
    setProvisionError(null);
    setStatus(SessionStatus.PROVISIONING);
    provision(current, syncGenerationRef.current, 0);
  }, [clearRetryTimer, provision]);

  /* ── Auth state subscription ── */
  useEffect(() => {
    if (!auth) {
      setStatus(SessionStatus.SIGNED_OUT);
      return undefined;
    }

    let unsubscribe = () => {};
    let cancelled = false;

    (async () => {
      // Persistence must settle before we trust currentUser, and a pending
      // redirect sign-in has to be consumed before the first state callback.
      await persistenceReady;

      try {
        await getRedirectResult(auth);
      } catch (err) {
        // Surfaced on the login screen via the thrown error path instead;
        // logging here keeps the cause visible for debugging.
        console.warn('[auth] redirect sign-in failed:', err?.code || err?.message);
      }

      if (cancelled) return;

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        clearRetryTimer();
        const generation = ++syncGenerationRef.current;

        if (!firebaseUser) {
          setUser(null);
          setAccount(null);
          setProvisionError(null);
          setStatus(SessionStatus.SIGNED_OUT);
          return;
        }

        setUser(firebaseUser);
        setStatus(SessionStatus.PROVISIONING);
        provision(firebaseUser, generation);
      });
    })();

    return () => {
      cancelled = true;
      clearRetryTimer();
      unsubscribe();
    };
  }, [provision, clearRetryTimer]);

  /**
   * Keeps the user object fresh when the token changes (e.g. after email
   * verification flips `emailVerified`), without re-running provisioning.
   */
  useEffect(() => {
    if (!auth) return undefined;
    return onIdTokenChanged(auth, (firebaseUser) => {
      if (!firebaseUser) return;
      setUser(firebaseUser);
      // Identity is usually unchanged, so nudge the version to propagate any
      // mutated claims to consumers.
      setUserVersion((v) => v + 1);
    });
  }, []);

  /**
   * When the API reports an unrecoverable session, sign out locally so the UI
   * cannot sit in a half-authenticated state.
   */
  useEffect(() => {
    return onSessionExpired(() => {
      if (auth?.currentUser) {
        signOut(auth).catch((err) => console.error('[auth] forced sign-out failed:', err));
      }
    });
  }, []);

  /* ── Actions ── */

  const loginWithEmail = useCallback(
    (email, password) => signInWithEmailAndPassword(auth, email.trim(), password),
    []
  );

  const registerWithEmail = useCallback(async (email, password, displayName) => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

    if (displayName?.trim()) {
      await updateProfile(credential.user, { displayName: displayName.trim() });
    }

    // Fire-and-forget: a mail delivery problem must not block registration,
    // and the user can request another email from the verification screen.
    sendEmailVerification(credential.user).catch((err) => {
      console.warn('[auth] could not send verification email:', err?.code || err?.message);
    });

    return credential;
  }, []);

  /**
   * Uses a popup on desktop and a redirect where popups are unreliable.
   * The previous popup-only implementation failed silently on mobile and
   * inside in-app browsers.
   */
  const loginWithGoogle = useCallback(async () => {
    if (shouldUseRedirect()) {
      // Navigates away; resolution happens via getRedirectResult on return.
      return signInWithRedirect(auth, googleProvider);
    }

    try {
      return await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // Fall back to redirect when the browser blocked the popup.
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
        return signInWithRedirect(auth, googleProvider);
      }
      throw err;
    }
  }, []);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email.trim()), []);

  const resendVerificationEmail = useCallback(async () => {
    const current = auth?.currentUser;
    if (!current) throw new Error('You are not signed in.');
    return sendEmailVerification(current);
  }, []);

  /**
   * Re-reads the account from Firebase to pick up a verification that happened
   * in another tab, then refreshes the token so the backend sees the new claim.
   */
  const refreshVerificationStatus = useCallback(async () => {
    const current = auth?.currentUser;
    if (!current) return false;

    await reload(current);
    await current.getIdToken(true); // force new token carrying email_verified

    // `reload` mutated `current` in place; never spread a Firebase User —
    // that would drop its prototype methods (getIdToken, delete, …).
    setUserVersion((v) => v + 1);
    return current.emailVerified;
  }, []);

  const logout = useCallback(async () => {
    clearRetryTimer();
    syncGenerationRef.current += 1;
    await signOut(auth);
    // State is cleared by the onAuthStateChanged callback so there is exactly
    // one place responsible for teardown.
  }, [clearRetryTimer]);

  /**
   * Always returns a promise. The previous version returned `null` outright
   * when there was no user, so `getToken().then(...)` threw.
   */
  const getToken = useCallback(async ({ forceRefresh = false } = {}) => {
    const current = auth?.currentUser;
    if (!current) return null;
    return current.getIdToken(forceRefresh);
  }, []);

  /** Lets consumers refresh the cached backend row after a balance change. */
  const refreshAccount = useCallback(async () => {
    if (!auth?.currentUser) return null;
    try {
      const data = await api.get('/api/auth/me');
      setAccount(data.user ?? null);
      return data.user ?? null;
    } catch (err) {
      console.error('[auth] failed to refresh account:', err);
      return null;
    }
  }, []);

  /**
   * Memoised so consumers do not re-render on every provider render. The old
   * implementation rebuilt this object and all callbacks each time.
   */
  const value = useMemo(
    () => ({
      // State
      user,
      account,
      status,
      provisionError,

      // Derived flags — these are what components should branch on.
      initialising: status === SessionStatus.INITIALISING,
      isAuthenticated: status === SessionStatus.READY,
      isProvisioning: status === SessionStatus.PROVISIONING,
      provisionFailed: status === SessionStatus.PROVISION_FAILED,
      // Recomputed whenever `userVersion` changes, which is how a mutated
      // Firebase User propagates to consumers.
      emailVerified: user?.emailVerified ?? false,

      // Actions
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      resetPassword,
      resendVerificationEmail,
      refreshVerificationStatus,
      refreshAccount,
      retryProvisioning,
      logout,
      getToken,
    }),
    [
      user,
      userVersion,
      account,
      status,
      provisionError,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      resetPassword,
      resendVerificationEmail,
      refreshVerificationStatus,
      refreshAccount,
      retryProvisioning,
      logout,
      getToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
