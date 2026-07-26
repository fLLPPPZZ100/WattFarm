import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient.js';

/**
 * Account page.
 *
 * The mining allocation sliders were removed along with the wind and hydro
 * networks: with a single energy source there was nothing to allocate, and
 * moving a slider only cost income, since power pointed at a network with no
 * placeable asset earned nothing.
 *
 * What replaced them is the information those sliders never gave: where the
 * player stands in the simulated network, which is what actually decides
 * earnings.
 */
export default function Profile() {
  const { user, emailVerified } = useAuth();

  const [network, setNetwork] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await api.get('/api/mining/network', { signal: controller.signal });
        setNetwork(data);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('[profile] could not load network status:', err);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const sharePercent =
    network && network.networkTotal > 0 ? (network.powerRate / network.networkTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">PROFILE</h2>
      </div>

      {/* Account */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-3">ACCOUNT</h3>
        <p className="text-text-muted text-sm">
          Email: <span className="text-text-primary">{user.email}</span>
          {emailVerified ? (
            <span className="ml-2 text-accent-current text-xs">verified</span>
          ) : (
            <span className="ml-2 text-accent-watt text-xs">unverified</span>
          )}
        </p>
        <p className="text-text-muted text-xs mt-1">
          User ID: <span className="font-mono text-text-muted">{user.uid.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Network standing */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-1">MINING NETWORK</h3>
        <p className="text-text-muted text-xs mb-5">
          Each cycle pays a fixed reward, split between everyone by their share of the network.
          Building more panels raises your share.
        </p>

        {loading ? (
          <p className="font-display text-[11px] uppercase tracking-widest text-text-muted">
            Loading
          </p>
        ) : !network ? (
          <p className="text-text-muted text-sm">Network status unavailable.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <Stat label="Your Power" value={`${network.powerRate.toFixed(1)} W/s`} tone="current" />
              <Stat label="Network" value={`${network.networkTotal.toFixed(1)} W/s`} />
              <Stat label="Your Share" value={`${sharePercent.toFixed(1)}%`} tone="current" />
              <Stat
                label="Est. / cycle"
                value={`${network.estimatedReward.toFixed(2)} VLT`}
                tone="watt"
              />
            </div>

            {/* Share bar */}
            <div className="h-2 w-full bg-bg-abyss border border-line-dusk">
              <div
                className="h-full bg-accent-current"
                style={{ width: `${Math.min(100, sharePercent).toFixed(1)}%` }}
              />
            </div>

            <div className="mt-4 pt-4 border-t border-line-dusk space-y-1">
              <Row label="Reward per cycle" value={`${network.budgetPerCycle} VLT`} />
              <Row label="Other miners" value={`${Math.max(0, network.minerCount - 1)}`} />
              <Row
                label="Simulated network"
                value={`${network.networkBaseline.toFixed(1)} W/s`}
                hint="stands in for competing miners"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const colour =
    tone === 'current' ? 'text-accent-current' : tone === 'watt' ? 'text-accent-watt' : 'text-text-primary';

  return (
    <div>
      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`font-mono text-sm ${colour}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-text-muted">
        {label}
        {hint && <span className="ml-2 text-text-muted/60">({hint})</span>}
      </span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  );
}
