import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';
import { buildReferralLink } from '../lib/referral.js';
import vltCoinImg from '../assets/coins/vlt-coin.png';

/** Formats a VLT amount for display. */
function fmtVlt(n) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Turns the server's fraction (0.25) into a label ("25%"). */
function fmtRate(rate) {
  const percent = (rate || 0) * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const KIND_LABELS = {
  mining: 'Mining',
  purchase: 'Purchases',
};

/**
 * Copy-to-clipboard button.
 *
 * Falls back to selecting the text when the Clipboard API is unavailable, which
 * is the case on plain HTTP origins and in some in-app browsers — exactly the
 * environments an invite link is likely to be opened in.
 */
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = useCallback(async () => {
    setFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }, [value]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleCopy}
        className="bg-accent-watt text-bg-abyss font-semibold px-4 py-2 rounded text-sm hover:brightness-110 transition-all whitespace-nowrap"
      >
        {copied ? 'Copied' : label}
      </button>
      {failed && (
        <span className="text-red-400/80 text-[11px]">Copy failed — select the text manually</span>
      )}
    </div>
  );
}

function StatCard({ label, value, hint, accent }) {
  return (
    <div className="rounded-xl border border-line-dusk bg-bg-abyss p-5">
      <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={'font-mono text-xl ' + (accent ? 'text-accent-watt' : 'text-text-primary')}>
        {value}
      </p>
      {hint && <p className="text-text-muted text-[11px] mt-1">{hint}</p>}
    </div>
  );
}

export default function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const result = await api.get('/api/referrals/me', { signal });
      setData(result);
      setError(null);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-text-muted text-sm">Loading referral data</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center max-w-md">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => load()}
            className="mt-3 text-accent-watt text-xs underline hover:brightness-110"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const link = buildReferralLink(data.referralCode);
  const miningRate = fmtRate(data.rates?.mining);
  const purchaseRate = fmtRate(data.rates?.purchase);
  const purchasesEnabled = (data.rates?.purchase || 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">REFERRALS</h2>
        <p className="text-text-muted text-sm mt-1">
          Invite other players and earn {miningRate} of what they mine
          {purchasesEnabled ? ` and ${purchaseRate} of what they spend` : ''}. Their earnings are
          never reduced — your commission is paid on top.
        </p>
      </div>

      {/* Invite link */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6 space-y-4">
        <h3 className="font-display text-sm text-text-primary tracking-wide">YOUR INVITE LINK</h3>

        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Link</p>
            <p className="font-mono text-xs text-text-primary break-all bg-bg-abyss border border-line-dusk rounded px-3 py-2">
              {link}
            </p>
          </div>
          <div className="pt-4">
            <CopyButton value={link} label="Copy link" />
          </div>
        </div>

        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Code</p>
            <p className="font-mono text-lg text-accent-watt tracking-[0.2em] bg-bg-abyss border border-line-dusk rounded px-3 py-2 inline-block">
              {data.referralCode}
            </p>
          </div>
          <div className="pt-4">
            <CopyButton value={data.referralCode} label="Copy code" />
          </div>
        </div>

        <p className="text-text-muted text-[11px] leading-relaxed">
          Commissions are settled once a day, for the previous day&apos;s activity, and land in your
          VLT balance. A player has to sign up through your link to be attributed — an existing
          account cannot be linked afterwards.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Players invited" value={data.totals.referredCount} />
        <StatCard
          label="Total earned"
          value={fmtVlt(data.totals.earned) + ' VLT'}
          accent
          hint={`${data.totals.commissionCount} commission${data.totals.commissionCount === 1 ? '' : 's'}`}
        />
        <StatCard
          label={`From mining (${miningRate})`}
          value={fmtVlt(data.totals.earnedByKind.mining) + ' VLT'}
        />
        <StatCard
          label={purchasesEnabled ? `From purchases (${purchaseRate})` : 'From purchases'}
          value={
            purchasesEnabled ? fmtVlt(data.totals.earnedByKind.purchase) + ' VLT' : 'Disabled'
          }
        />
      </div>

      {/* Invited players */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-1">
          INVITED PLAYERS
        </h3>
        <p className="text-text-muted text-[11px] mb-4">
          Players are shown by a short reference rather than by name or email.
        </p>

        {data.referred.length === 0 ? (
          <p className="text-text-muted text-sm py-6 text-center">
            Nobody has signed up through your link yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left font-normal pb-2">Player</th>
                  <th className="text-left font-normal pb-2">Joined</th>
                  <th className="text-right font-normal pb-2">Earned from them</th>
                </tr>
              </thead>
              <tbody>
                {data.referred.map((entry) => (
                  <tr key={entry.label} className="border-t border-line-dusk/50">
                    <td className="py-2.5 font-mono text-xs text-text-primary">{entry.label}</td>
                    <td className="py-2.5 text-text-muted text-xs">{fmtDate(entry.joinedAt)}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-accent-watt">
                      {fmtVlt(entry.earned)} VLT
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commission history */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
          COMMISSION HISTORY
        </h3>

        {data.history.length === 0 ? (
          <p className="text-text-muted text-sm py-6 text-center">
            No commissions yet. They appear the day after your invited players are active.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left font-normal pb-2">Day</th>
                  <th className="text-left font-normal pb-2">Source</th>
                  <th className="text-left font-normal pb-2">From</th>
                  <th className="text-right font-normal pb-2">Their activity</th>
                  <th className="text-right font-normal pb-2">Your cut</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.id} className="border-t border-line-dusk/50">
                    <td className="py-2.5 text-text-muted text-xs">{fmtDate(row.periodDate)}</td>
                    <td className="py-2.5 text-text-primary text-xs">
                      {KIND_LABELS[row.kind] || row.kind}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-text-muted">{row.from}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-text-muted">
                      {fmtVlt(row.sourceAmount)} VLT
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs text-accent-watt">
                      <img
                        src={vltCoinImg}
                        alt=""
                        width="12"
                        height="12"
                        className="inline-block mr-1 align-middle"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      +{fmtVlt(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
