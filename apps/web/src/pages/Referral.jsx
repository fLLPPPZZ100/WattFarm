import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/apiClient.js';
import { buildInviteLink } from '../lib/referral.js';

/** Formats a commission rate (0.13) as a percentage string ("13%"). */
function asPercent(rate) {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

/**
 * Formats a VLT amount to two places.
 *
 * Takes anything, because calling `.toFixed()` straight on a response field is
 * how this page managed to blank the entire app: `undefined.toFixed` throws, and
 * there is no error boundary to contain it. Non-numeric input degrades to 0.00.
 */
function toVlt(value) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '—';
  }
}

/**
 * Copies text, falling back to a hidden textarea.
 *
 * `navigator.clipboard` is unavailable on plain HTTP origins and in older
 * browsers, which is exactly where a player is most likely to be sharing a link.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(value);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1800);
  }, [value]);

  return (
    <div>
      <p className="font-display text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
        {label}
      </p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 bg-bg-abyss border border-line-dusk rounded px-3 py-2 font-mono text-sm text-text-primary truncate">
          {value}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 px-3 py-2 rounded border border-accent-watt/40 bg-accent-watt/10 font-display text-[10px] uppercase tracking-widest text-accent-watt hover:bg-accent-watt/20 transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function Referral() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const summary = await api.get('/api/referral', { signal: controller.signal });
        setData(summary);
        setError('');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Could not load your referral data.');
      } finally {
        /**
         * Not unconditional. `finally` runs even after the `AbortError` early
         * return, so the previous version cleared the loading flag for a request
         * that was cancelled and had set neither `data` nor `error`.
         *
         * Under StrictMode that happens on every mount: the first effect is torn
         * down immediately, so the page rendered with data still null and
         * dereferencing it threw, blanking the whole app.
         */
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="font-display text-[11px] uppercase tracking-widest text-text-muted">
          Loading referrals
          <span className="ml-1 inline-block h-3 w-2 bg-accent-watt align-middle animate-blink" />
        </p>
      </div>
    );
  }

  /**
   * `!data` is checked alongside the error, not assumed away. Any path that
   * leaves loading false without a payload — a cancelled request, a 204, a
   * response shape change — must render something rather than fall through to
   * code that dereferences it.
   */
  if (error || !data) {
    return (
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <p className="text-sm text-red-400">
          {error || 'Could not load your referral data.'}
        </p>
      </div>
    );
  }

  const link = buildInviteLink(data.code);
  const qualifyingRate = data.config?.qualifyingPowerRate ?? 0;
  const signupBonus = data.config?.signupBonus ?? 0;

  /**
   * Every field is defaulted rather than trusted.
   *
   * A rendering page has no business crashing over a missing number: without an
   * error boundary above it, one `undefined.toFixed()` takes down the entire app,
   * which is exactly what happened here. Defaults mean a partial response
   * degrades to zeros instead of a white screen.
   */
  const points = data.points ?? 0;
  const totals = data.totals ?? {};
  const referrals = Array.isArray(data.referrals) ? data.referrals : [];
  const tiers = Array.isArray(data.config?.levels) ? data.config.levels : [];

  // Progress towards the next tier, for the bar.
  const next = data.nextLevel;
  const progressPercent =
    next && next.pointsRequired > 0
      ? Math.min(100, Math.round((points / next.pointsRequired) * 100))
      : 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">REFERRAL</h2>
        <p className="text-text-muted text-sm mt-1">
          Invite players and earn a share of what they mine — for as long as they keep mining.
        </p>
      </div>

      {/* ── Invite link ── */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6 space-y-4">
        <h3 className="font-display text-sm text-text-primary tracking-wide">YOUR INVITE</h3>
        <CopyRow label="Code" value={data.code} />
        <CopyRow label="Link" value={link} />
        <p className="text-text-muted text-xs">
          Anyone who creates an account through your link starts with{' '}
          <span className="text-accent-watt font-mono">{signupBonus} VLT</span> extra.
        </p>
      </div>

      {/* ── Tier ── */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-sm text-text-primary tracking-wide">
              LEVEL {data.level}
            </h3>
            <p className="text-text-muted text-xs mt-1">
              You earn{' '}
              <span className="text-accent-watt font-mono">{asPercent(data.commissionRate)}</span>{' '}
              of every payout your qualified referrals receive.
            </p>
          </div>
          <p className="font-mono text-2xl text-accent-watt leading-none">
            {asPercent(data.commissionRate)}
          </p>
        </div>

        <div>
          <div className="h-2 bg-bg-abyss border border-line-dusk rounded overflow-hidden">
            <div
              className="h-full bg-accent-watt transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-text-muted text-xs mt-2">
            {next ? (
              <>
                {points} / {next.pointsRequired} points —{' '}
                <span className="text-text-primary">{next.pointsRemaining} more</span> qualified
                referral{next.pointsRemaining === 1 ? '' : 's'} to reach level {next.level} (
                {asPercent(next.commissionRate)})
              </>
            ) : (
              <>Maximum level reached — {points} points</>
            )}
          </p>
        </div>
      </div>

      {/* ── Totals ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Referrals', value: totals.referrals ?? 0 },
          { label: 'Qualified', value: totals.qualified ?? 0 },
          {
            label: 'Commission earned',
            value: `${toVlt(totals.commissionEarned)} VLT`,
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-bg-panel border border-line-dusk rounded-lg p-4">
            <p className="font-display text-[10px] uppercase tracking-widest text-text-muted">
              {stat.label}
            </p>
            <p className="font-mono text-xl text-text-primary mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── How it works ── */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-3">HOW IT WORKS</h3>
        <ul className="space-y-2 text-text-muted text-sm">
          <li>
            <span className="text-accent-watt">1.</span> Share your link. New accounts created
            through it are permanently linked to yours.
          </li>
          <li>
            <span className="text-accent-watt">2.</span> A referral{' '}
            <span className="text-text-primary">qualifies</span> once they have{' '}
            <span className="font-mono text-text-primary">{qualifyingRate} W/s</span> installed —
            that is real investment, so throwaway accounts earn you nothing.
          </li>
          <li>
            <span className="text-accent-watt">3.</span> From then on you receive a percentage of
            every mining payout they earn. It never comes out of their reward.
          </li>
          <li>
            <span className="text-accent-watt">4.</span> Each qualified referral is one point, and
            points raise your level — and your rate.
          </li>
        </ul>

        {tiers.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {tiers.map((tier) => (
              <div
                key={tier.level}
                className={
                  'rounded p-2.5 text-center border ' +
                  (tier.level === data.level
                    ? 'bg-accent-watt/10 border-accent-watt/40'
                    : 'bg-bg-abyss border-line-dusk')
                }
              >
                <p className="font-display text-[10px] uppercase tracking-widest text-text-muted">
                  Lv {tier.level}
                </p>
                <p
                  className={
                    'font-mono text-sm mt-1 ' +
                    (tier.level === data.level ? 'text-accent-watt' : 'text-text-primary')
                  }
                >
                  {asPercent(tier.commissionRate)}
                </p>
                <p className="text-text-muted text-[10px] mt-0.5">{tier.pointsRequired} pts</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Referral list ── */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
          YOUR REFERRALS
        </h3>

        {referrals.length === 0 ? (
          <p className="text-text-muted text-sm">
            No referrals yet. Share your link to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {referrals.map((referral, index) => (
              <div
                key={`${referral.email ?? 'anon'}-${index}`}
                className="flex items-center justify-between gap-3 py-2 border-b border-line-dusk last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-text-primary text-sm truncate">
                    {referral.email ?? 'Player'}
                  </p>
                  <p className="text-text-muted text-xs mt-0.5">
                    Joined {formatDate(referral.joinedAt)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm text-accent-watt">
                    {toVlt(referral.earned)} VLT
                  </p>
                  <p
                    className={
                      'text-[10px] font-display uppercase tracking-widest mt-0.5 ' +
                      (referral.qualified ? 'text-accent-watt' : 'text-text-muted')
                    }
                  >
                    {referral.qualified ? 'Qualified' : 'Not qualified'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.joinedViaInvite ? (
        <p className="text-text-muted text-xs text-center">
          You joined through an invite and received a{' '}
          <span className="text-accent-watt font-mono">
            {toVlt(data.joinedViaInvite.bonus)} VLT
          </span>{' '}
          welcome bonus.
        </p>
      ) : null}
    </div>
  );
}
