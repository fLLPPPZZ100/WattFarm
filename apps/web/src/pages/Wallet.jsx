import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchWithAuth(url) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function Wallet() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minigameLogs, setMinigameLogs] = useState([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [historyData, minigameData] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/mining/history`),
          fetchWithAuth(`${API_URL}/api/minigames/status`).catch(() => ({ games: [] })),
        ]);
        setPayouts(historyData.payouts || []);
        // For minigame history we show from the playCountToday
        setMinigameLogs(minigameData.games || []);
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Log in to view your wallet.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Loading wallet data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">WALLET</h2>
        <p className="text-text-muted text-sm mt-1">
          Track your VLT earnings from mining payouts and minigame rewards.
        </p>
      </div>

      {/* Mining Payout History */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
          MINING PAYOUTS
        </h3>

        {payouts.length === 0 ? (
          <p className="text-text-muted text-sm">
            No mining payouts yet. Configure your mining allocations and wait for the next payout cycle.
          </p>
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-2 border-b border-line-dusk last:border-0"
              >
                <div>
                  <p className="text-text-muted text-xs capitalize">
                    {p.details.network} · {p.details.percentage}% allocation
                  </p>
                  <p className="text-text-muted text-xs mt-0.5">
                    {new Date(p.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className="font-mono text-sm text-accent-watt">
                  +{p.amount.toFixed(2)} VLT
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minigame Activity Summary */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
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