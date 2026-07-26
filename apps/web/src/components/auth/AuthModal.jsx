import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

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

export default function AuthModal({ open, onClose }) {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

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
      setError(friendlyError(err));
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
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // Clear error when switching between login/register
  const toggleMode = () => {
    setError('');
    setIsRegister(!isRegister);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-panel border border-line-dusk rounded-lg w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl text-accent-watt tracking-wide">
            {isRegister ? 'CREATE ACCOUNT' : 'LOG IN'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-sm text-red-300 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-bg-abyss border border-line-dusk rounded px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-watt transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-bg-abyss border border-line-dusk rounded px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-watt transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-watt text-bg-abyss font-semibold py-2 rounded hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Log In'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 h-px bg-line-dusk" />
          <span className="px-3 text-xs text-text-muted">or</span>
          <div className="flex-1 h-px bg-line-dusk" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full border border-line-dusk text-text-primary py-2 rounded hover:bg-line-dusk/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
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
          Continue with Google
        </button>

        {/* Toggle */}
        <p className="text-center text-sm text-text-muted mt-4">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={toggleMode}
            className="text-accent-watt hover:underline"
          >
            {isRegister ? 'Log in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}