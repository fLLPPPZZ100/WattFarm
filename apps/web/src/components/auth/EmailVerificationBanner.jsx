import { useState } from 'react';

import { useAuth } from '../../context/AuthContext.jsx';
import { friendlyAuthError } from '../../lib/authErrors.js';

/**
 * Persistent notice for accounts with an unverified email address.
 *
 * The backend blocks purchases and minigames for these accounts, so without
 * this banner the player would just see actions failing with no explanation of
 * why or how to fix it.
 *
 * Renders nothing for verified users and for providers that vouch for the
 * address (Google accounts arrive already verified).
 */
export default function EmailVerificationBanner() {
  const { user, emailVerified, resendVerificationEmail, refreshVerificationStatus } = useAuth();

  const [busy, setBusy] = useState(null); // 'resend' | 'check'
  const [feedback, setFeedback] = useState(null); // { tone, message }
  const [dismissed, setDismissed] = useState(false);

  if (!user || emailVerified || dismissed) return null;

  const handleResend = async () => {
    setBusy('resend');
    setFeedback(null);
    try {
      await resendVerificationEmail();
      setFeedback({ tone: 'success', message: 'Email sent. Check your inbox.' });
    } catch (err) {
      setFeedback({ tone: 'error', message: friendlyAuthError(err) });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Users verify by clicking a link in another tab, which Firebase does not
   * push back to this one. This lets them pull the updated status without a
   * full page reload.
   */
  const handleCheck = async () => {
    setBusy('check');
    setFeedback(null);
    try {
      const verified = await refreshVerificationStatus();
      if (!verified) {
        setFeedback({
          tone: 'error',
          message: 'Not confirmed yet. Click the link in the email and try again.',
        });
      }
      // When verified, `emailVerified` flips and the banner unmounts itself.
    } catch (err) {
      setFeedback({ tone: 'error', message: friendlyAuthError(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="shrink-0 border-b-2 border-accent-watt/40 bg-accent-watt/10 px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 text-[11px] leading-snug text-text-primary">
          <span className="font-display mr-2 text-[9px] uppercase tracking-widest text-accent-watt">
            Verify your email
          </span>
          Confirm <span className="font-mono text-accent-watt">{user.email}</span> to buy items and
          play the minigames.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={busy !== null}
            className="pixel-focus border-2 border-accent-watt/50 px-2.5 py-1 font-display text-[9px]
                       uppercase tracking-widest text-accent-watt transition-none
                       hover:bg-accent-watt/15 disabled:opacity-50"
            style={{ borderRadius: 0 }}
          >
            {busy === 'resend' ? 'Sending' : 'Resend'}
          </button>

          <button
            type="button"
            onClick={handleCheck}
            disabled={busy !== null}
            className="pixel-focus border-2 border-line-dusk px-2.5 py-1 font-display text-[9px]
                       uppercase tracking-widest text-text-muted transition-none
                       hover:border-accent-current/50 hover:text-accent-current disabled:opacity-50"
            style={{ borderRadius: 0 }}
          >
            {busy === 'check' ? 'Checking' : "I've confirmed"}
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss notice"
            className="pixel-focus px-1.5 text-text-muted transition-none hover:text-text-primary"
          >
            ✕
          </button>
        </div>
      </div>

      {feedback && (
        <p
          role="status"
          className={`mt-1.5 text-[10px] ${
            feedback.tone === 'success' ? 'text-accent-current' : 'text-danger-crt'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
