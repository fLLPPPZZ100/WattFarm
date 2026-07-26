import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/apiClient.js';
import { friendlyAuthError } from '../lib/authErrors.js';

const GAME_INFO = {
  'solar-swipe': {
    label: 'Solar Swipe',
    description: 'Swipe panels to catch sunlight rays.',
    color: '#F2B84B',
    emoji: '☀️',
  },
  'wind-clicker': {
    label: 'Wind Clicker',
    description: 'Click to spin the turbine blades faster.',
    color: '#5FD4C4',
    emoji: '💨',
  },
  'hydro-race': {
    label: 'Hydro Race',
    description: 'Race the water flow through the dam gates.',
    color: '#4DA8DA',
    emoji: '💧',
  },
};

export default function Minigames() {
  const [games, setGames] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pollingRef = useRef(null);

  // RequireAuth guarantees a provisioned session before this page mounts.
  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get('/api/minigames/status');
      setGames(data.games);
    } catch {
      // Poll errors are ignored on purpose: a transient failure would
      // otherwise flash an error every 2 seconds.
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollingRef.current);
  }, [fetchStatus]);

  const handlePlay = async (game) => {
    setError('');
    setResult(null);
    setPlaying(game);
    try {
      const data = await api.post(`/api/minigames/${encodeURIComponent(game)}/play`);
      setResult({
        game,
        result: data.result,
        vltEarned: data.vltEarned,
        newBalance: data.newBalance,
      });
      fetchStatus(); // refresh cooldowns immediately
    } catch (err) {
      // Surfaces the email-verification gate and rate limits with a readable
      // message rather than a raw status code.
      setError(friendlyAuthError(err));
    } finally {
      setPlaying(null);
    }
  };

  const formatCooldown = (ms) => {
    if (ms <= 0) return 'Ready';
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-accent-watt tracking-wide">MINIGAMES</h2>
        <p className="text-text-muted text-sm mt-1">
          Play minigames to earn VLT. Cooldowns increase the more you play each day.
        </p>
      </div>

      {/* Error / Result banner */}
      {error && (
        <div className="p-4 rounded bg-red-900/30 border border-red-800 text-sm text-red-300">
          {error}
        </div>
      )}
      {result && (
        <div
          className={`p-4 rounded border text-sm ${
            result.result === 'none'
              ? 'bg-bg-panel border-line-dusk text-text-muted'
              : 'bg-accent-current/10 border-accent-current text-accent-current'
          }`}
        >
          <span className="font-display tracking-wide">
            {GAME_INFO[result.game]?.label}
          </span>
          {' — '}
          {result.result === 'none' ? (
            'No luck this time. Try again!'
          ) : (
            <>
              <span className="font-bold uppercase">{result.result}</span>!
              Earned{' '}
              <span className="font-mono text-accent-watt">{result.vltEarned} VLT</span>.
              New balance:{' '}
              <span className="font-mono">{result.newBalance.toFixed(1)} VLT</span>
            </>
          )}
        </div>
      )}

      {/* Game cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {games.map((g) => {
          const info = GAME_INFO[g.game];
          const onCooldown = g.cooldownRemainingMs > 0;
          return (
            <div
              key={g.game}
              className="bg-bg-panel border border-line-dusk rounded-lg p-6 flex flex-col items-center gap-4"
            >
              {/* Emoji + label */}
              <div className="text-center">
                <span className="text-4xl">{info.emoji}</span>
                <h3 className="font-display text-sm text-text-primary tracking-wide mt-2">
                  {info.label}
                </h3>
                <p className="text-xs text-text-muted mt-1">{info.description}</p>
              </div>

              {/* Cooldown indicator */}
              <div className="space-y-1 text-center">
                <p className="text-xs text-text-muted">
                  Plays today: <span className="text-text-primary">{g.playCountToday}</span>
                </p>
                <p
                  className={`font-mono text-sm ${
                    onCooldown ? 'text-red-400' : 'text-accent-current'
                  }`}
                >
                  {onCooldown ? formatCooldown(g.cooldownRemainingMs) : 'Ready'}
                </p>
              </div>

              {/* Play button */}
              <button
                onClick={() => handlePlay(g.game)}
                disabled={onCooldown || playing !== null}
                className="w-full py-2 rounded text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: onCooldown ? 'transparent' : info.color,
                  color: onCooldown ? 'currentColor' : '#0B1622',
                  border: onCooldown ? `1px solid ${info.color}40` : 'none',
                }}
              >
                {playing === g.game ? 'Playing...' : onCooldown ? 'On Cooldown' : 'Play'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}