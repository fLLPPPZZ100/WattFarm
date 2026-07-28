import { useState } from 'react';
import avatars, { getAvatarPrice, isAvatarAvailable } from '../../data/avatars';
import { api } from '../../lib/apiClient.js';
import { friendlyAuthError } from '../../lib/authErrors.js';
import { notify } from '../../lib/notify.js';

/** Display name for an avatar id, for use in notification copy. */
function avatarLabel(avatarId) {
  const match = avatars.find((avatar) => avatar.id === avatarId);
  return match ? match.label : 'Avatar';
}

/**
 * Grid of selectable avatars.
 *
 * Renders the actual artwork. It used to draw the first two letters of each
 * label in a bordered box, because the catalogue carried image paths that did
 * not resolve — so the picker showed "DE", "SO", "WI" instead of avatars.
 *
 * @param {string[]} unlockedAvatars ids the account has bought
 * @param {string} activeAvatarId currently equipped id
 * @param {(result: {avatarId: string, unlockedAvatars: string[], newBalance?: number}) => void} onAvatarChanged
 *   Receives the server's response, not just the id. Both routes return the
 *   authoritative row, so the caller can update its cache without a refetch.
 */
export default function AvatarPicker({ unlockedAvatars = [], activeAvatarId, onAvatarChanged }) {
  const [loading, setLoading] = useState(null); // id being processed

  const handleSelect = async (avatarId) => {
    if (avatarId === activeAvatarId) return;

    setLoading(avatarId);

    try {
      const data = await api.patch('/api/users/me/avatar', { avatarId });
      onAvatarChanged(data);
      notify.success('Avatar equipped', `${avatarLabel(avatarId)} is now your avatar.`);
    } catch (err) {
      notify.error('Could not change avatar', friendlyAuthError(err));
    } finally {
      setLoading(null);
    }
  };

  const handleUnlock = async (avatarId) => {
    setLoading(avatarId);

    try {
      const data = await api.post(
        `/api/users/me/avatars/${encodeURIComponent(avatarId)}/unlock`
      );
      // The unlock route equips the avatar in the same transaction, so the
      // response already carries the new active id and the debited balance.
      onAvatarChanged(data);

      notify.success(
        'Avatar unlocked',
        typeof data.newBalance === 'number'
          ? `${avatarLabel(avatarId)} equipped. Balance: ${data.newBalance.toFixed(1)} VLT.`
          : `${avatarLabel(avatarId)} equipped.`
      );
    } catch (err) {
      // Covers the "not enough VLT" rejection, which is the common case here.
      notify.error('Could not unlock avatar', friendlyAuthError(err));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Failures are reported through the notification system rather than an
          inline banner, so the grid does not shift as messages come and go. */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {avatars.map((avatar) => {
          const isAvailable = isAvatarAvailable(avatar.id, unlockedAvatars);
          const isActive = activeAvatarId === avatar.id;
          const isBusy = loading === avatar.id;
          const isPurchasable = !isAvailable && avatar.unlockType === 'vlt';
          const price = getAvatarPrice(avatar.id);

          // Only the active avatar is disabled among available ones — a click on
          // it is a no-op the server would reject with "already active".
          const isDisabled = isBusy || isActive || (!isAvailable && !isPurchasable);

          return (
            <button
              key={avatar.id}
              type="button"
              disabled={isDisabled}
              aria-pressed={isActive}
              onClick={() => {
                if (isAvailable) handleSelect(avatar.id);
                else if (isPurchasable) handleUnlock(avatar.id);
              }}
              title={
                isActive
                  ? 'Current avatar'
                  : isAvailable
                    ? `Use ${avatar.label}`
                    : isPurchasable
                      ? `Unlock for ${price} VLT`
                      : 'Locked'
              }
              className={
                'relative flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ' +
                (isActive
                  ? 'border-accent-watt bg-accent-watt/10 shadow-[0_0_12px_rgba(242,184,75,0.3)] cursor-default'
                  : isAvailable
                    ? 'border-line-dusk bg-bg-abyss hover:border-accent-watt/50 hover:bg-bg-panel cursor-pointer'
                    : isPurchasable
                      ? 'border-line-dusk bg-bg-abyss opacity-60 hover:opacity-90 cursor-pointer'
                      : 'border-line-dusk bg-bg-abyss opacity-40 cursor-not-allowed')
              }
            >
              <div
                className={
                  'w-16 h-16 rounded-lg border-2 overflow-hidden bg-bg-abyss ' +
                  (isActive ? 'border-accent-watt' : 'border-line-dusk')
                }
              >
                <img
                  src={avatar.image}
                  alt={avatar.label}
                  className="w-full h-full object-cover block"
                  // The art is low-resolution pixel art; the default smoothing
                  // blurs it at this size.
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>

              <span
                className={
                  'text-xs leading-tight ' + (isActive ? 'text-accent-watt' : 'text-text-muted')
                }
              >
                {avatar.label}
              </span>

              {isPurchasable && (
                <span className="font-mono text-xs text-accent-watt">{price} VLT</span>
              )}

              {isActive && (
                <span className="absolute top-1 right-1.5 text-accent-watt text-xs" aria-hidden="true">
                  ★
                </span>
              )}

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
