import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { friendlyAuthError, scorePassword } from '../lib/authErrors.js';
import PixelSky from '../components/auth/PixelSky.jsx';
import { SessionLoading } from '../components/auth/SessionGate.jsx';
import {
  PixelPanel,
  PixelHeading,
  PixelField,
  PixelButton,
  PixelAlert,
  PixelDivider,
  PixelTabs,
  PixelStrengthMeter,
  MailIcon,
  LockIcon,
  UserIcon,
  GoogleIcon,
  ArrowLeftIcon,
  CheckIcon,
} from '../components/ui/pixel.jsx';

import panelImg from '../assets/items/panel-1.png';
import vltCoinImg from '../assets/coins/vlt-coin.png';

/** Minimum length we enforce. Firebase's own floor is 6, which is too low. */
const MIN_PASSWORD_LENGTH = 8;

/** Screens this page can show. Kept as a union so transitions stay explicit. */
const View = Object.freeze({
  CREDENTIALS: 'credentials',
  FORGOT: 'forgot',
  FORGOT_SENT: 'forgot-sent',
});

/**
 * Lightweight email sanity check.
 *
 * Deliberately permissive: the authoritative validation happens at Firebase.
 * This only catches obvious typos before spending a network round trip, so an
 * over-strict regex would do more harm than good.
 */
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export default function Login() {
  const {
    isAuthenticated,
    initialising,
    isProvisioning,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    resetPassword,
  } = useAuth();

  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [view, setView] = useState(View.CREDENTIALS);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [errorKey, setErrorKey] = useState(0); // re-triggers the shake
  const [busy, setBusy] = useState(null); // 'email' | 'google' | 'reset'

  const emailRef = useRef(null);
  /**
   * Guards against a second submit slipping through before `busy` has been
   * committed by React — pressing Enter twice quickly could otherwise fire two
   * registration requests.
   */
  const inFlightRef = useRef(false);

  const isRegister = mode === 'register';
  const strength = useMemo(() => scorePassword(password), [password]);

  /**
   * Redirect once the session is fully ready.
   *
   * Always to the farm. This previously honoured a `state.from` location handed
   * over by RequireAuth, so a deep link resumed after signing in — but a session
   * should start at the game view rather than dropping the player into /wallet
   * or /storage because that was the URL they happened to open.
   */
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  /* Focus the first field on mount and whenever the view changes. */
  useEffect(() => {
    const timer = setTimeout(() => emailRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [view]);

  const showError = useCallback((message) => {
    setFormError(message);
    setErrorKey((k) => k + 1);
  }, []);

  /** Clears transient feedback when the user edits the form or switches mode. */
  const resetFeedback = useCallback(() => {
    setFormError('');
    setFieldErrors({});
  }, []);

  const handleModeChange = useCallback(
    (next) => {
      if (next === mode) return;
      setMode(next);
      resetFeedback();
      // Password rules differ between modes, so a value that was valid for
      // login may be rejected on register. Clearing avoids a confusing state.
      setPassword('');
    },
    [mode, resetFeedback]
  );

  /** Validates locally so obvious problems never cost a network call. */
  const validate = useCallback(() => {
    const errors = {};

    if (!email.trim()) errors.email = 'Enter your email.';
    else if (!looksLikeEmail(email)) errors.email = 'Invalid email address.';

    if (!password) errors.password = 'Enter your password.';
    else if (isRegister && password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password, isRegister]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlightRef.current) return;

    resetFeedback();
    if (!validate()) return;

    inFlightRef.current = true;
    setBusy('email');

    try {
      if (isRegister) {
        await registerWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
      // Navigation is handled by the isAuthenticated effect once the backend
      // sync completes, so nothing to do here.
    } catch (err) {
      showError(friendlyAuthError(err));
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (inFlightRef.current) return;

    resetFeedback();
    inFlightRef.current = true;
    setBusy('google');

    try {
      await loginWithGoogle();
    } catch (err) {
      showError(friendlyAuthError(err));
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    if (inFlightRef.current) return;

    resetFeedback();

    if (!looksLikeEmail(email)) {
      setFieldErrors({ email: 'Enter a valid email to receive the link.' });
      return;
    }

    inFlightRef.current = true;
    setBusy('reset');

    try {
      await resetPassword(email);
      setView(View.FORGOT_SENT);
    } catch (err) {
      /**
       * `auth/user-not-found` is swallowed on purpose: confirming whether an
       * address is registered would let anyone enumerate accounts. The success
       * screen is shown either way.
       */
      if (err?.code === 'auth/user-not-found') {
        setView(View.FORGOT_SENT);
      } else {
        showError(friendlyAuthError(err));
      }
    } finally {
      inFlightRef.current = false;
      setBusy(null);
    }
  };

  /**
   * Covers two windows where the form must not be interactive:
   *  - `initialising`: Firebase is restoring an existing session, so showing
   *    the form would flash it for users who are already logged in.
   *  - `isProvisioning`: credentials were accepted and the backend account is
   *    being prepared. Without this the form reappears enabled for a moment
   *    after a successful submit, inviting a duplicate login attempt.
   */
  if (initialising || isProvisioning) {
    return (
      <SessionLoading label={isProvisioning ? 'Syncing' : 'Starting'} />
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <PixelSky />

      <main className="relative w-full max-w-[440px] animate-pixel-in">
        {/* ── Wordmark ── */}
        <div className="mb-6 flex items-end justify-center gap-3">
          <img
            src={panelImg}
            alt=""
            width="44"
            height="44"
            className="animate-float"
            style={{
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 0 10px rgba(242,184,75,0.5))',
            }}
          />
          <div>
            <h1
              className="font-display text-3xl leading-none text-accent-watt"
              style={{ textShadow: '3px 3px 0 #060D15' }}
            >
              WATTFARM
            </h1>
            <p className="mt-1.5 font-display text-[9px] uppercase tracking-[0.2em] text-accent-current">
              idle solar tycoon
            </p>
          </div>
        </div>

        <PixelPanel scanlines>
          <div className="p-6 sm:p-7">
            {/* ══ Password reset: confirmation ══ */}
            {view === View.FORGOT_SENT && (
              <>
                <PixelHeading id="auth-title" className="mb-4">
                  Link sent
                </PixelHeading>

                <PixelAlert tone="success" className="mb-5">
                  If an account exists for <strong className="font-mono">{email.trim()}</strong>,
                  the reset link will arrive shortly. Check your spam folder too.
                </PixelAlert>

                <PixelButton
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setView(View.CREDENTIALS);
                    resetFeedback();
                  }}
                >
                  <ArrowLeftIcon />
                  Back to sign in
                </PixelButton>
              </>
            )}

            {/* ══ Password reset: request ══ */}
            {view === View.FORGOT && (
              <>
                <PixelHeading id="auth-title" className="mb-2">
                  Reset password
                </PixelHeading>
                <p className="mb-5 text-[11px] leading-relaxed text-text-muted">
                  Enter your account email and we will send a link to create a new password.
                </p>

                {formError && (
                  <PixelAlert shakeKey={errorKey} className="mb-4">
                    {formError}
                  </PixelAlert>
                )}

                <form onSubmit={handleReset} noValidate>
                  <PixelField
                    ref={emailRef}
                    label="Email"
                    icon={MailIcon}
                    type="email"
                    name="email"
                    autoComplete="email"
                    spellCheck="false"
                    placeholder="you@example.com"
                    value={email}
                    error={fieldErrors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors({});
                    }}
                  />

                  <PixelButton
                    type="submit"
                    className="mt-5 w-full"
                    loading={busy === 'reset'}
                    disabled={busy !== null}
                  >
                    {busy === 'reset' ? 'Sending' : 'Send link'}
                  </PixelButton>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setView(View.CREDENTIALS);
                    resetFeedback();
                  }}
                  className="pixel-focus mt-4 flex w-full items-center justify-center gap-1.5
                             text-[11px] text-text-muted transition-none hover:text-accent-watt"
                >
                  <ArrowLeftIcon className="h-3 w-3" />
                  Back to sign in
                </button>
              </>
            )}

            {/* ══ Login / register ══ */}
            {view === View.CREDENTIALS && (
              <>
                <PixelTabs
                  value={mode}
                  onChange={handleModeChange}
                  options={[
                    { value: 'login', label: 'Sign in' },
                    { value: 'register', label: 'Create account' },
                  ]}
                />

                <PixelHeading id="auth-title" className="mb-1.5">
                  {isRegister ? 'New account' : 'Welcome'}
                </PixelHeading>
                <p className="mb-5 text-[11px] leading-relaxed text-text-muted">
                  {isRegister
                    ? 'Build your solar plant, generate watts and stack up VLT.'
                    : 'Sign in to keep running your solar farm.'}
                </p>

                {formError && (
                  <PixelAlert shakeKey={errorKey} className="mb-4">
                    {formError}
                  </PixelAlert>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {isRegister && (
                    <PixelField
                      label="Nickname (optional)"
                      icon={UserIcon}
                      name="displayName"
                      autoComplete="nickname"
                      maxLength={24}
                      placeholder="SolarEngineer"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  )}

                  <PixelField
                    ref={emailRef}
                    label="Email"
                    icon={MailIcon}
                    type="email"
                    name="email"
                    autoComplete="email"
                    spellCheck="false"
                    placeholder="you@example.com"
                    value={email}
                    error={fieldErrors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                  />

                  <div>
                    <PixelField
                      label="Password"
                      icon={LockIcon}
                      revealable
                      name="password"
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      placeholder="••••••••"
                      value={password}
                      error={fieldErrors.password}
                      hint={
                        isRegister && !fieldErrors.password
                          ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                          : undefined
                      }
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                    />

                    {isRegister && password.length > 0 && (
                      <PixelStrengthMeter
                        score={strength.score}
                        label={strength.label}
                        hint={strength.hint}
                      />
                    )}

                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          setView(View.FORGOT);
                          resetFeedback();
                        }}
                        className="pixel-focus mt-2 text-[11px] text-text-muted transition-none
                                   hover:text-accent-watt hover:underline"
                      >
                        Forgot my password
                      </button>
                    )}
                  </div>

                  <PixelButton
                    type="submit"
                    className="w-full"
                    loading={busy === 'email'}
                    disabled={busy !== null}
                  >
                    {busy === 'email'
                      ? 'Connecting'
                      : isRegister
                        ? 'Create account'
                        : 'Sign in'}
                  </PixelButton>
                </form>

                <PixelDivider>or</PixelDivider>

                <PixelButton
                  variant="ghost"
                  className="w-full"
                  onClick={handleGoogle}
                  loading={busy === 'google'}
                  disabled={busy !== null}
                >
                  {busy !== 'google' && <GoogleIcon />}
                  Continue with Google
                </PixelButton>

                {/* Reward teaser — reinforces the idle-game premise */}
                <div className="pixel-panel-inset mt-5 flex items-center gap-2.5 px-3 py-2.5">
                  <img
                    src={vltCoinImg}
                    alt=""
                    width="18"
                    height="18"
                    style={{
                      imageRendering: 'pixelated',
                      filter: 'drop-shadow(0 0 5px rgba(242,184,75,0.55))',
                    }}
                  />
                  <p className="text-[11px] leading-snug text-text-muted">
                    Earn <span className="font-mono text-accent-watt">VLT</span> every payout
                    cycle, even while offline.
                  </p>
                </div>

                {isRegister && (
                  <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-text-muted">
                    <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-accent-current" />
                    <span>
                      We will send a verification email. You need to confirm it to buy items and
                      play the minigames.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </PixelPanel>

        {/* Footer */}
        <p className="mt-5 text-center text-[10px] text-text-muted">
          <Link to="/" className="pixel-focus transition-none hover:text-accent-watt">
            ← Back to the farm
          </Link>
        </p>
      </main>
    </div>
  );
}
