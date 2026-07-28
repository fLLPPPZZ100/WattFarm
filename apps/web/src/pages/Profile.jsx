import { useAuth } from '../context/AuthContext';
import AvatarPicker from '../components/profile/AvatarPicker.jsx';
import AccountPanel from '../components/profile/AccountPanel.jsx';

/**
 * Profile page.
 *
 * The mining allocation sliders used to live here. They moved to
 * `components/profile/MiningAllocationPanel.jsx` and are deliberately not
 * mounted — see that file for why, and for how to bring them back. Nothing was
 * deleted and the API routes are untouched.
 *
 * With the allocation fetch gone this page has no async work of its own, so the
 * loading gate went with it: `AccountPanel` and `AvatarPicker` both read
 * already-resolved state from `useAuth`, and `RequireAuth` guarantees a
 * provisioned session before the page mounts.
 */
export default function Profile() {
  const { account, patchAccount } = useAuth();

  /**
   * The avatar lives on the account row, which AuthContext caches, so writing it
   * back there is what updates the header — the picker does not talk to the
   * header directly. `account` can be briefly null while the session is being
   * provisioned, hence the fallbacks.
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-xl text-accent-watt">PROFILE</h2>
      </div>

      {/* Identity, membership dates, nickname and password */}
      <AccountPanel />

      {/* Avatar */}
      <div className="bg-bg-panel border border-line-dusk rounded-lg p-6">
        <h3 className="text-heading-md text-text-primary mb-4">AVATAR</h3>
        <p className="text-body-sm text-text-muted mb-6">
          Choose your avatar. It is applied straight away and shows up in the header.
        </p>
        <AvatarPicker
          unlockedAvatars={unlockedAvatars}
          activeAvatarId={activeAvatarId}
          onAvatarChanged={handleAvatarChanged}
        />
      </div>
    </div>
  );
}
