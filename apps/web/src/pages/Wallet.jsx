import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient.js';

export default function Wallet() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minigameLogs, setMinigameLogs] = useState([]);
  const [error, setError] = useState('');

  // RequireAuth guarantees a provisioned session before this page mounts, so
  // there is no unauthenticated branch to handle here any more.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [historyData, minigameData] = await Promise.all([
          api.get('/api/mining/history', { signal: controller.signal }),
          api
            .get('/api/minigames/status', { signal: controller.signal })
            .catch(() => ({ games: [] })),
        ]);
        setPayouts(historyData.payouts || []);
        // For minigame history we show from the playCountToday
        setMinigameLogs(minigameData.games || []);
        setError('');
      } catch (err) {
        // Ignore the abort triggered by unmount; report anything else instead
        // of failing silently as the previous version did.
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Could not load the wallet.');
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="font-display text-[11px] uppercase tracking-widest text-text-muted">
          Loading wallet
          <span className="ml-1 inline-block h-3 w-2 bg-accent-watt align-middle animate-blink" />
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-xl text-accent-watt">WALLET</h2>
        <p className="text-body-sm text-text-muted mt-1">
          Track your VLT earnings from mining payouts and minigame rewards.
        </p>
      </div>

      {error && (
        <div className="border-2 border-danger-crt bg-danger-crt/10 px-3 py-2.5 text-sm text-danger-crt">
          {error}
        </div>
      )}

      {/* Mining Payout History */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="text-heading-md text-text-primary mb-4">
          MINING PAYOUTS
        </h3>

        {payouts.length === 0 ? (
          /*
            The only requirement is a panel installed on a mount. This used to
            tell the player to "configure your mining allocations", an
            instruction nobody could follow even before allocations were removed.
          */
          <p className="text-text-muted text-sm">
            No mining payouts yet. Install a panel on a mount in your farm and wait for the next
            payout cycle.
          </p>
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-2 border-b border-line-dusk last:border-0"
              >
                <div>
                  {/*
                    Power rate rather than the old "network · percentage" line:
                    there is one network now, and no allocation to show. Payouts
                    recorded before that change still carry those fields, so this
                    reads what every row has.
                  */}
                  <p className="text-body-sm text-text-muted">
                    {typeof p.details.powerRate === 'number'
                      ? `${p.details.powerRate} W/s mined`
                      : 'Mining payout'}
                  </p>
                  <p className="text-body-sm text-text-muted mt-0.5">
                    {new Date(p.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className="text-currency text-accent-watt">
                  +{p.amount.toFixed(2)} VLT
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minigame Activity Summary */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="text-heading-md text-text-primary mb-4">
          MINIGAME ACTIVITY TODAY
        </h3>

        {minigameLogs.length === 0 ? (
          <p className="text-text-muted text-sm">No minigame activity today.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {minigameLogs.map((g) => (
              <div key={g.game} className="bg-bg-abyss rounded p-3">
                <p className="font-display text-xs text-accent-watt tracking-wide capitalize">
                  {g.game.replace('-', ' ')}
                </p>
                <p className="text-text-muted text-xs mt-2">
                  Plays today: <span className="text-text-primary">{g.playCountToday}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}