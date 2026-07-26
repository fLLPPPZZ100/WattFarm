const avatars = [
  {
    id: 'default',
    label: 'Default',
    image: 'src/assets/avatars/default.png',
    unlockType: 'free',
  },
  {
    id: 'solar-farmer',
    label: 'Solar Farmer',
    image: 'src/assets/avatars/solar-farmer.png',
    unlockType: 'free',
  },
  {
    id: 'wind-rider',
    label: 'Wind Rider',
    image: 'src/assets/avatars/wind-rider.png',
    unlockType: 'free',
  },
  {
    id: 'hydro-diver',
    label: 'Hydro Diver',
    image: 'src/assets/avatars/hydro-diver.png',
    unlockType: 'free',
  },
  {
    id: 'golden-engineer',
    label: 'Golden Engineer',
    image: 'src/assets/avatars/golden-engineer.png',
    unlockType: 'vlt',
    price: 50,
  },
  {
    id: 'neon-technician',
    label: 'Neon Technician',
    image: 'src/assets/avatars/neon-technician.png',
    unlockType: 'vlt',
    price: 100,
  },
  {
    id: 'void-keeper',
    label: 'Void Keeper',
    image: 'src/assets/avatars/void-keeper.png',
    unlockType: 'vlt',
    price: 200,
  },
];

/**
 * Look up an avatar by id. Returns undefined if not found.
 */
export function getAvatarById(id) {
  return avatars.find((a) => a.id === id);
}

/**
 * Returns true if the avatar exists and costs VLT.
 */
export function isVltAvatar(id) {
  const avatar = getAvatarById(id);
  return avatar && avatar.unlockType === 'vlt' && typeof avatar.price === 'number';
}

/**
 * Returns the price of a VLT avatar, or 0 if not a VLT avatar.
 */
export function getAvatarPrice(id) {
  const avatar = getAvatarById(id);
  return avatar && avatar.unlockType === 'vlt' ? avatar.price || 0 : 0;
}

export default avatars;