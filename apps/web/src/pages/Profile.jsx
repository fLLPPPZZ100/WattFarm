import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient.js';
import { friendlyAuthError } from '../lib/authErrors.js';
import AvatarPicker from '../components/profile/AvatarPicker.jsx';
import AccountPanel from '../components/profile/AccountPanel.jsx';

const NETWORK_NAMES = {
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
};

export default function Profile() {
  // Identity fields moved into AccountPanel, which reads them from useAuth
  // itself; this page only needs the account row for the avatar selection.
  const { account, patchAccount } = useAuth();
  const [allocations, setAllocations] = useState({
    solar: 0,
    wind: 0,
    hydro: 0,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // RequireAuth guarantees a provisioned session before this page mounts.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await api.get('/api/mining/allocations', { signal: controller.signal });
        const map = { solar: 0, wind: 0, hydro: 0 };
        for (const a of data.allocations) {
          map[a.network] = a.percentage;
        }
        setAllocations(map);
      } catch (err) {
        // Falling back to zeroed sliders is acceptable here, but an aborted
        // request must not be treated as a real failure.
        if (err?.name !== 'AbortError') {
          console.error('[profile] could not load allocations:', err);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const handleSliderChange = (network, value) => {
    const newAlloc = { ...allocations, [network]: parseFloat(value) };
    setAllocations(newAlloc);
  };

  const total = allocations.solar + allocations.wind + allocations.hydro;

  /**
   * The avatar lives on the account row, which AuthContext caches, so writing it
   * back there is what updates the header — the picker does not talk to the
   * header directly. `account` can be briefly null while the session is being
   * provisioned, hence the fallback.
   */
  const activeAvatarId = account?.avatarId || 'default';
  const unlockedAvatars = account?.unlockedAvatars || [];

  const handleAvatarChanged = (result) => {
    if (!result?.avatarId) return;

    patchAccount({
      avatarId: result.avatarId,
      // The unlock route also returns the debited balance; the select route
      // does not, so only merge what actually came back.
      ...(result.unlockedAvatars ? { unlockedAvatars: result.unlockedAvatars } : {}),
      ...(typeof result.newBalance === 'number' ? { vltBalance: result.newBalance } : {}),
    });
  };

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

      await api.post('/api/mining/allocations', { allocations: allocationList });

      setMessage('Mining allocations saved.');
    } catch (err) {
      setMessage(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="font-display text-[11px] uppercase tracking-widest text-text-muted">
          Carregando perfil
          <span className="ml-1 inline-block h-3 w-2 bg-accent-watt align-middle animate-blink" />
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">PROFILE</h2>
      </div>

      {/* Identity, membership dates, nickname and password */}
      <AccountPanel />

      {/* Avatar */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
          AVATAR
        </h3>
        <p className="text-text-muted text-xs mb-6">
          Choose your avatar. It is applied straight away and shows up in the
          header.
        </p>
        <AvatarPicker
          unlockedAvatars={unlockedAvatars}
          activeAvatarId={activeAvatarId}
          onAvatarChanged={handleAvatarChanged}
        />
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