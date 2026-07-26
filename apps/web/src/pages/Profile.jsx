import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchWithAuth(url, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

const NETWORK_NAMES = {
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
};

export default function Profile() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState({
    solar: 0,
    wind: 0,
    hydro: 0,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const data = await fetchWithAuth(`${API_URL}/api/mining/allocations`);
        const map = { solar: 0, wind: 0, hydro: 0 };
        for (const a of data.allocations) {
          map[a.network] = a.percentage;
        }
        setAllocations(map);
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  const handleSliderChange = (network, value) => {
    const newAlloc = { ...allocations, [network]: parseFloat(value) };
    setAllocations(newAlloc);
  };

  const total = allocations.solar + allocations.wind + allocations.hydro;

  const handleSave = async () => {
    if (Math.abs(total - 100) > 0.01) {
      setMessage('Allocations must sum to 100%.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const allocationList = Object.entries(allocations)
        .filter(([, pct]) => pct > 0)
        .map(([network, percentage]) => ({ network, percentage }));

      await fetchWithAuth(`${API_URL}/api/mining/allocations`, {
        method: 'POST',
        body: JSON.stringify({ allocations: allocationList }),
      });

      setMessage('Mining allocations saved.');
    } catch (err) {
      setMessage(err.message || 'Failed to save allocations.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Log in to view your profile.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Loading profile data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">PROFILE</h2>
      </div>

      {/* User info */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-3">
          ACCOUNT
        </h3>
        <p className="text-text-muted text-sm">
          Email: <span className="text-text-primary">{user.email}</span>
        </p>
        <p className="text-text-muted text-xs mt-1">
          User ID: <span className="font-mono text-text-muted">{user.uid.slice(0, 8)}...</span>
        </p>
      </div>

      {/* Mining Allocation */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
          MINING ALLOCATION
        </h3>
        <p className="text-text-muted text-xs mb-6">
          Set how your accumulated W is split across networks for mining payouts.
          Must total 100%.
        </p>

        <div className="space-y-5">
          {Object.entries(NETWORK_NAMES).map(([key, label]) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                <label className="text-text-muted text-sm">{label}</label>
                <span className="font-mono text-sm text-accent-watt">
                  {allocations[key]}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={allocations[key]}
                onChange={(e) => handleSliderChange(key, e.target.value)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #F2B84B ${allocations[key]}%, #2A3B4D ${allocations[key]}%)`,
                  accentColor: '#F2B84B',
                }}
              />
            </div>
          ))}
        </div>

        {/* Total indicator */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-line-dusk">
          <span className="text-text-muted text-sm">Total</span>
          <span
            className={`font-mono text-lg ${
              Math.abs(total - 100) < 0.01 ? 'text-accent-current' : 'text-red-400'
            }`}
          >
            {total}%
          </span>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded text-sm ${
              message.includes('saved')
                ? 'bg-accent-current/10 border border-accent-current text-accent-current'
                : 'bg-red-900/30 border border-red-800 text-red-300'
            }`}
          >
            {message}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || Math.abs(total - 100) > 0.01}
          className="mt-4 w-full bg-accent-watt text-bg-abyss font-semibold py-2 rounded text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Allocations'}
        </button>
      </div>
    </div>
  );
}