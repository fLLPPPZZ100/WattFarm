/**
 * Avatar catalogue.
 *
 * ## Images are imported, not path strings
 *
 * This file used to describe seven avatars with `image: 'src/assets/avatars/…'`.
 * Two things were wrong with that. The files did not exist — only `avatar-1.png`
 * and `avatar-female.png` are in `assets/avatars` — and a bare path string is not
 * how Vite resolves an asset: it rewrites `import` specifiers to hashed build
 * URLs, so a hand-written `src/...` string would 404 in development and in a
 * build. Importing the file is what makes the URL correct in both.
 *
 * ## Adding an avatar
 *
 * 1. Drop the PNG in `apps/web/src/assets/avatars/`.
 * 2. Import it here and add an entry below.
 * 3. If it is free, add its id to `FREE_AVATAR_IDS` in `apps/api/src/routes/users.js`.
 *    The server decides what a player may equip, so an avatar missing from that
 *    list is rejected with a 403 no matter what this file says.
 * 4. If it costs VLT, add it to `AVATAR_PRICES` there instead — prices are
 *    authoritative on the server so a client cannot name its own.
 */

import avatarDefaultImg from '../assets/avatars/avatar-1.png';
import avatarFemaleImg from '../assets/avatars/avatar-female.png';

/**
 * `unlockType: 'free'` means available to everyone from the start.
 * `unlockType: 'vlt'` requires a purchase and must carry a `price`.
 *
 * The id `default` is load-bearing: it is the column default for `User.avatarId`
 * and the only entry in the default `unlockedAvatars`, so every existing account
 * already points at it. Renaming it would orphan them.
 */
const avatars = [
  {
    id: 'default',
    label: 'Default',
    image: avatarDefaultImg,
    unlockType: 'free',
  },
  {
    id: 'female',
    label: 'Female',
    image: avatarFemaleImg,
    unlockType: 'free',
  },
];

/** Look up an avatar by id. Returns undefined when the id is unknown. */
export function getAvatarById(id) {
  return avatars.find((avatar) => avatar.id === id);
}

/**
 * Resolves an id to a usable image URL, falling back to the first avatar.
 *
 * The fallback matters: an account can hold an `avatarId` this build no longer
 * ships — a paid avatar that was removed, or a row from an older catalogue —
 * and rendering `undefined` into `src` shows a broken image. Falling back keeps
 * the header intact while the player picks something else.
 */
export function getAvatarImage(id) {
  const avatar = getAvatarById(id);
  return (avatar || avatars[0]).image;
}

/**
 * Whether the player may equip this avatar.
 *
 * Free avatars are available to everyone; paid ones have to appear in the
 * account's `unlockedAvatars`. Kept here so the picker and any future caller
 * agree, and so it mirrors the check the server performs.
 */
export function isAvatarAvailable(id, unlockedAvatars = []) {
  const avatar = getAvatarById(id);
  if (!avatar) return false;
  if (avatar.unlockType === 'free') return true;
  return unlockedAvatars.includes(id);
}

/** Price of a VLT avatar, or 0 when it is not one. */
export function getAvatarPrice(id) {
  const avatar = getAvatarById(id);
  return avatar && avatar.unlockType === 'vlt' ? avatar.price || 0 : 0;
}

export default avatars;
