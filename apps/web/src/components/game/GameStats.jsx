import { useState, useEffect, useMemo, useRef } from 'react';
import { usePlacementStore } from '../../store/placementStore';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/apiClient.js';
import vltCoinImg from '../../assets/coins/vlt-coin.png';

const CYCLE_SECONDS = 600; // 10 minutes

function fmt(n) { return (n || 0).toFixed(1); }

/**
 * Payout history for the toast notification.
 *
 * Returns null instead of throwing: this runs on a 30s poll purely to detect
 * new payouts, so a transient failure should be invisible to the player. The
 * shared client still handles session expiry globally.
 */
async function fetchHistory() {
  try {
    return await api.get('/api/mining/history');
  } catch {
    return null;
  }
}

export default function GameStats() {
  const { placedSolar, placedMount } = usePlacementStore();
  const { user } = useAuth();
  const [countdown, setCountdown] = useState(CYCLE_SECONDS);
  const [notification, setNotification] = useState(null);
  const lastPayoutId = useRef(null);

  // Countdown synced to 10-minute cycle
  useEffect(function () {
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const secondsIntoCycle = now % CYCLE_SECONDS;
      const remaining = CYCLE_SECONDS - secondsIntoCycle;
      setCountdown(remaining);
    }
    tick();
    const id = setInterval(tick, 1000);
    return function () { clearInterval(id); };
  }, []);

  // Poll for new payouts
  useEffect(function () {
    if (!user) return;

    async function check() {
      const data = await fetchHistory();
      if (!data || !data.payouts || data.payouts.length === 0) return;

      const latest = data.payouts[0];
      if (lastPayoutId.current && lastPayoutId.current !== latest.id) {
        // New payout detected!
        setNotification('+' + fmt(latest.amount) + ' VLT received!');
        setTimeout(function () { setNotification(null); }, 5000);
      }
      lastPayoutId.current = latest.id;
    }

    // Initial check
    fetchHistory().then(function (data) {
      if (data && data.payouts && data.payouts.length > 0) {
        lastPayoutId.current = data.payouts[0].id;
      }
    });

    const id = setInterval(check, 30000); // poll every 30s
    return function () { clearInterval(id); };
  }, [user]);

  var stats = useMemo(function () {
    var activeSolar = placedSolar || 0;
    var activeMounts = placedMount || 0;
    var totalPower = activeSolar * 1;
    var blockReward = totalPower * 0.05;
    var networkHash = totalPower * 1000;

    return {
      activeSolar: activeSolar,
      activeMounts: activeMounts,
      totalPower: totalPower,
      blockReward: blockReward,
      networkHash: networkHash,
    };
  }, [placedSolar, placedMount]);

  // Format countdown
  var min = Math.floor(countdown / 60);
  var sec = countdown % 60;
  var countdownStr = min + ':' + (sec < 10 ? '0' : '') + sec;

  return (
    <>
      {/* Payout notification toast */}
      {notification && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slide-down">
          <div className="bg-accent-watt/20 border border-accent-watt rounded-xl px-5 py-2.5 text-sm font-semibold text-accent-watt backdrop-blur-sm shadow-lg">
            🪙 {notification}
          </div>
        </div>
      )}

      {/* Stats panel */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none" style={{ width: '220px' }}>
        <div className="bg-bg-panel/90 backdrop-blur-sm border border-line-dusk rounded-xl p-4 space-y-3 text-xs">
          {/* Active Power */}
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Active Power</p>
            <p className="font-mono text-sm text-accent-current">{fmt(stats.totalPower)} W/s</p>
          </div>

          {/* Active Assets */}
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Active Assets</p>
            <div className="flex gap-3 text-[11px]">
              <span className="text-accent-watt">☀ {stats.activeSolar}</span>
              <span className="text-text-muted">🔩 {stats.activeMounts}</span>
            </div>
          </div>

          {/* Block Reward Countdown */}
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Next Payout</p>
            <p className="font-mono text-xs text-accent-watt">{countdownStr}</p>
          </div>

          {/* Block Reward Amount */}
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Est. Reward</p>
            <p className="font-mono text-xs text-accent-watt">
              <img src={vltCoinImg} alt="VLT" width="14" height="14" className="inline-block mr-1 align-middle" style={{ imageRendering: 'pixelated' }} />
              {fmt(stats.blockReward)} VLT
            </p>
          </div>

          {/* Hashrate */}
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Hashrate</p>
            <p className="font-mono text-xs text-text-muted">{stats.networkHash.toLocaleString()} H/s</p>
          </div>
        </div>
      </div>
    </>
  );
}