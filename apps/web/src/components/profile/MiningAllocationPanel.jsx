import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient.js';
import { friendlyAuthError } from '../../lib/authErrors.js';

/** Networks the server accepts, in display order. */
const NETWORK_LABELS = {
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
};

/**
 * Mining allocation sliders — split the farm's power across the three networks.
 *
 * ## Not currently mounted
 *
 * This is intentionally not rendered anywhere. It was lifted out of
 * `pages/Profile.jsx` unchanged so the feature is preserved while we decide what
 * to do with it, and so re-enabling it is one import plus one line of JSX.
 *
 * The reason it is parked: only solar has a placeable power source. In
 * `services/miningPayout.js`, `NETWORK_SOURCES.wind` and `.hydro` are `null`, so
 * those two networks pay nothing — while these sliders happily let a player
 * allocate 100% to them and then earn zero, with no warning anywhere. With a
 * 40 W/s farm the options work out as:
 *
 *   100% solar            25.00 VLT per cycle
 *   50 solar / 50 wind    16.67 VLT
 *   34 / 33 / 33          12.69 VLT
 *   100% hydro             0.00 VLT
 *
 * So the control has exactly one correct setting and every other position is a
 * straight loss — which is why it reads as pointless.
 *
 * The mechanic itself is sound and worth keeping. Each network has its own
 * budget and its own baseline, and `computeShare` is concave, so spreading
 * escapes diminishing returns: the same 40 W/s farm would earn 37.50 VLT split
 * three ways versus 25.00 concentrated. Once wind and hydro have something to
 * generate from, this becomes a real decision instead of a trap.
 *
 * The API side is untouched and still live: `GET`/`POST /api/mining/allocations`
 * work, and the payout cron still reads whatever rows exist.
 */
export default function MiningAllocationPanel() {
  const [allocations, setAllocations] = useState({ solar: 0, wind: 0, hydro: 0 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await api.get('/api/mining/allocations', { signal: controller.signal });
        const map = { solar: 0, wind: 0, hydro: 0 };
        for (const allocation of data.allocations) {
          map[allocation.network] = allocation.percentage;
        }
        setAllocations(map);
      } catch (err) {
        // Falling back to zeroed sliders is acceptable here, but an aborted
        // request must not be treated as a real failure.
        if (err?.name !== 'AbortError') {
          console.error('[mining-allocation] could not load allocations:', err);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const handleSliderChange = (network, value) => {
    setAllocations((current) => ({ ...current, [network]: parseFloat(value) }));
  };

  const total = allocations.solar + allocations.wind + allocations.hydro;
  const totalIsValid = Math.abs(total - 100) < 0.01;

  const handleSave = async () => {
    if (!totalIsValid) {
      setMessage('Allocations must sum to 100%.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      // Networks left at zero are omitted; the server deletes any row that is
      // absent from the payload.
      const allocationList = Object.entries(allocations)
        .filter(([, percentage]) => percentage > 0)
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
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <p className="font-display text-[11px] uppercase tracking-widest text-text-muted">
          Loading allocations
          <span className="ml-1 inline-block h-3 w-2 bg-accent-watt align-middle animate-blink" />
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
      <h3 className="font-display text-sm text-text-primary tracking-wide mb-4">
        MINING ALLOCATION
      </h3>
      {/* The old copy said "accumulated W", which is vocabulary from the model
          this replaced — payouts are based on an instantaneous rate now. */}
      <p className="text-text-muted text-xs mb-6">
        Choose how your power output is split across the mining networks. Must total 100%.
      </p>

      <div className="space-y-5">
        {Object.entries(NETWORK_LABELS).map(([network, label]) => (
          <div key={network}>
            <div className="flex justify-between mb-1">
              <label htmlFor={`allocation-${network}`} className="text-text-muted text-sm">
                {label}
              </label>
              <span className="font-mono text-sm text-accent-watt">{allocations[network]}%</span>
            </div>
            <input
              id={`allocation-${network}`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={allocations[network]}
              onChange={(event) => handleSliderChange(network, event.target.value)}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #F2B84B ${allocations[network]}%, #2A3B4D ${allocations[network]}%)`,
                accentColor: '#F2B84B',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-line-dusk">
        <span className="text-text-muted text-sm">Total</span>
        <span
          className={`font-mono text-lg ${totalIsValid ? 'text-accent-current' : 'text-red-400'}`}
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
        type="button"
        onClick={handleSave}
        disabled={saving || !totalIsValid}
        className="mt-4 w-full bg-accent-watt text-bg-abyss font-semibold py-2 rounded text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : 'Save allocations'}
      </button>
    </div>
  );
}
