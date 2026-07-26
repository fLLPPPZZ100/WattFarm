import { useState } from 'react';
import avatars, { getAvatarById, isVltAvatar, getAvatarPrice } from '../../data/avatars';
import { auth } from '../../firebase';

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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function AvatarPicker({ unlockedAvatars, activeAvatarId, vltBalance, onAvatarChanged }) {
  const [loading, setLoading] = useState(null); // avatarId being processed
  const [error, setError] = useState('');

  const handleSelect = async (avatarId) => {
    if (avatarId === activeAvatarId) return;

    setError('');
    setLoading(avatarId);

    try {
      await fetchWithAuth(`${API_URL}/api/users/me/avatar`, {
        method: 'PATCH',
        body: JSON.stringify({ avatarId }),
      });
      onAvatarChanged(avatarId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleUnlock = async (avatarId) => {
    setError('');
    setLoading(avatarId);

    try {
      const data = await fetchWithAuth(`${API_URL}/api/users/me/avatars/${avatarId}/unlock`, {
        method: 'POST',
      });
      onAvatarChanged(data.avatarId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-sm text-red-300 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {avatars.map((avatar) => {
          const isUnlocked = unlockedAvatars.includes(avatar.id);
          const isActive = activeAvatarId === avatar.id;
          const isBusy = loading === avatar.id;
          const price = getAvatarPrice(avatar.id);

          return (
            <button
              key={avatar.id}
              disabled={isBusy}
              onClick={() => {
                if (isActive) return;
                if (isUnlocked) {
                  handleSelect(avatar.id);
                } else if (avatar.unlockType === 'vlt') {
                  handleUnlock(avatar.id);
                }
              }}
              className={`
                relative flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isActive
                  ? 'border-accent-watt bg-accent-watt/10 shadow-[0_0_12px_rgba(242,184,75,0.3)]'
                  : isUnlocked
                    ? 'border-line-dusk bg-bg-abyss hover:border-accent-watt/50 hover:bg-bg-panel cursor-pointer'
                    : avatar.unlockType === 'vlt'
                      ? 'border-line-dusk bg-bg-abyss opacity-60 hover:opacity-90 cursor-pointer'
                      : 'border-line-dusk bg-bg-abyss opacity-40 cursor-not-allowed'
                }
              `}
              title={isUnlocked ? (isActive ? 'Current avatar' : 'Select avatar') : (avatar.unlockType === 'vlt' ? `Unlock for ${price} VLT` : 'Locked')}
            >
              {/* Sprite placeholder */}
              <div
                className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center ${
                  isActive ? 'border-accent-watt' : 'border-line-dusk'
                }`}
                style={{
                  backgroundColor: isActive ? 'rgba(242,184,75,0.1)' : 'var(--tw-bg-abyss)',
                }}
              >
                {isUnlocked ? (
                  <span className="font-display text-xs text-text-primary">
                    {avatar.label.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <span className="text-text-muted text-lg">🔒</span>
                )}
              </div>

              {/* Label */}
              <span className={`text-xs leading-tight ${isActive ? 'text-accent-watt' : 'text-text-muted'}`}>
                {avatar.label}
              </span>

              {/* Lock overlay with price */}
              {!isUnlocked && avatar.unlockType === 'vlt' && (
                <span className="font-mono text-xs text-accent-watt">
                  {price} VLT
                </span>
              )}

              {/* Active indicator */}
              {isActive && (
                <span className="absolute top-1 right-1.5 text-accent-watt text-xs">★</span>
              )}

              {/* Loading spinner */}
              {isBusy && (
                <div className="absolute inset-0 bg-bg-abyss/70 rounded-lg flex items-center justify-center">
                  <span className="text-text-muted text-sm">...</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}