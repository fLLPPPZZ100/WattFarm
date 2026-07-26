import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import panelImg from '../../assets/items/panel-1.png';
import vltCoinImg from '../../assets/coins/vlt-coin.png';

function friendlyError(firebaseError) {
  const raw = firebaseError?.code || firebaseError?.message || String(firebaseError);

  const map = {
    'auth/email-already-in-use': 'This email is already registered. Try logging in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/user-not-found': 'No account found with this email. Create one instead.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Try again when ready.',
    'auth/cancelled-popup-request': 'Another sign-in attempt is already in progress.',
    'auth/popup-blocked': 'Pop-ups are blocked by your browser. Please allow them and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact support.',
    'auth/requires-recent-login': 'Please log out and log in again to continue.',
    'auth/account-exists-with-different-credential':
      'An account already exists with the same email but a different sign-in method.',
    'auth/internal-error': 'Something went wrong on our end. Please try again.',
  };

  for (const [code, msg] of Object.entries(map)) {
    if (raw.includes(code)) return msg;
  }

  return 'An unexpected error occurred. Please try again.';
}

/* ── Small presentational helpers ── */

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ off }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.3 7.4C3.9 8.9 3 11 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1" />
      <path d="M9.9 10.1a3 3 0 0 0 4.1 4.2" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
      <path d="M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/* ── Main component ── */

export default function AuthModal({ open, onClose }) {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);

  // Close on Escape + lock background scroll while open
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, loading, onClose]);

  // Autofocus the email field when opening
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => emailRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const showError = (message) => {
    setError(message);
    setErrorKey((k) => k + 1); // re-triggers the shake animation
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      showError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err) {
      showError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const setMode = (register) => {
    if (register === isRegister) return;
    setError('');
    setIsRegister(register);
  };

  const inputClass =
    'w-full bg-bg-abyss border border-line-dusk rounded-lg pl-10 pr-3 py-2.5 text-sm text-text-primary ' +
    'placeholder-text-muted/60 outline-none transition-all duration-150 ' +
    'focus:border-accent-watt focus:ring-2 focus:ring-accent-watt/25 hover:border-line-dusk/80';

  const tabClass = (activeTab) =>
    'relative flex-1 py-2 rounded-md font-display text-[10px] tracking-widest uppercase transition-all duration-150 ' +
    (activeTab
      ? 'bg-accent-watt/10 text-accent-watt border border-accent-watt/30'
      : 'text-text-muted border border-transparent hover:text-text-primary hover:bg-bg-abyss/60');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-abyss/80 backdrop-blur-md animate-fade-in"
      onMouseDown={(e) => {
        // Close when clicking the backdrop itself (not the panel)
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      {/* Ambient glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-[520px] h-[520px] rounded-full animate-glow-pulse"
        style={{
          background:
            'radial-gradient(circle, rgba(242,184,75,0.14) 0%, rgba(95,212,196,0.06) 45%, transparent 70%)',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-[420px] bg-bg-panel border border-line-dusk rounded-2xl overflow-hidden shadow-2xl animate-pop-in"
      >
        {/* Top accent bar — matches the app shell */}
        <div className="h-0.5 bg-accent-watt" />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted
                     border border-transparent transition-all hover:text-text-primary hover:bg-bg-abyss/70
                     hover:border-line-dusk disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        {/* ── Brand header ── */}
        <div className="relative px-7 pt-7 pb-6 border-b border-line-dusk overflow-hidden">
          {/* Pixel grid texture */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(42,59,77,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,59,77,0.35) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              maskImage: 'linear-gradient(to bottom, black, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
            }}
          />

          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src={panelImg}
                alt=""
                width="52"
                height="52"
                className="animate-float"
                style={{
                  imageRendering: 'pixelated',
                  filter: 'drop-shadow(0 0 10px rgba(242,184,75,0.45))',
                }}
              />
            </div>

            <div className="min-w-0">
              <h2
                id="auth-modal-title"
                className="font-display text-xl text-accent-watt tracking-wide leading-none"
              >
                WATTFARM
              </h2>
              <p className="mt-2 text-xs text-text-muted leading-snug">
                {isRegister
                  ? 'Create your account and start building your solar farm.'
                  : 'Welcome back — sign in to keep your panels running.'}
              </p>
            </div>
          </div>

          {/* Reward hint */}
          <div className="relative mt-5 flex items-center gap-2 rounded-lg border border-line-dusk bg-bg-abyss/60 px-3 py-2">
            <img
              src={vltCoinImg}
              alt=""
              width="18"
              height="18"
              style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 5px rgba(242,184,75,0.5))' }}
            />
            <span className="text-[11px] text-text-muted">
              Earn <span className="font-mono text-accent-watt">VLT</span> every payout cycle
            </span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-7 py-6">
          {/* Mode tabs */}
          <div className="flex gap-1.5 p-1 mb-5 rounded-lg bg-bg-abyss border border-line-dusk">
            <button type="button" onClick={() => setMode(false)} className={tabClass(!isRegister)}>
              Log in
            </button>
            <button type="button" onClick={() => setMode(true)} className={tabClass(isRegister)}>
              Sign up
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              key={errorKey}
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 animate-shake"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 shrink-0 mt-px text-red-400"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span className="text-xs leading-relaxed text-red-200">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="auth-email"
                className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <MailIcon />
                </span>
                <input
                  id="auth-email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  spellCheck="false"
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <LockIcon />
                </span>
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className={inputClass + ' pr-11'}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center
                             rounded-md text-text-muted transition-colors hover:text-accent-watt hover:bg-line-dusk/30"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              {isRegister && (
                <p className="mt-1.5 text-[10px] text-text-muted">Use at least 6 characters.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent-watt text-bg-abyss font-semibold text-sm
                         py-2.5 rounded-lg transition-all hover:brightness-110 active:brightness-95
                         focus:outline-none focus:ring-2 focus:ring-accent-watt/50 focus:ring-offset-2 focus:ring-offset-bg-panel
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Spinner />}
              {loading ? 'Please wait…' : isRegister ? 'Create Account' : 'Log In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-line-dusk" />
            <span className="text-[10px] uppercase tracking-wider text-text-muted">or</span>
            <div className="flex-1 h-px bg-line-dusk" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 border border-line-dusk bg-bg-abyss/40
                       text-text-primary text-sm py-2.5 rounded-lg transition-all
                       hover:bg-bg-abyss hover:border-accent-watt/40
                       focus:outline-none focus:ring-2 focus:ring-accent-watt/30
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Footer switch */}
          <p className="mt-5 text-center text-xs text-text-muted">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(!isRegister)}
              className="text-accent-watt font-medium transition-colors hover:text-accent-current hover:underline"
            >
              {isRegister ? 'Log in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
