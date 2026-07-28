import Phaser from 'phaser';
import { BootScene, FarmScene } from './scenes/index.js';

var game = null;
var onPlacementChange = null;
var currentUserId = null;

export function setPlacementCallback(fn) {
  onPlacementChange = fn;
}

/**
 * Reports the placed layout to React.
 *
 * Takes an object rather than a positional list: the payload has grown to six
 * fields, and `(panels, mounts, single, double, rate, baseline)` at the call
 * site is impossible to read and easy to mis-order.
 *
 * @param {object} placement
 * @param {number} placement.placedSolar panels installed
 * @param {number} placement.placedMount mounts installed, both types
 * @param {number} placement.placedMountSingle single mounts installed
 * @param {number} placement.placedMountDouble double mounts installed
 * @param {number} [placement.powerRate] W/s including mount bonuses
 * @param {number} [placement.networkBaseline] synthetic competing power
 */
export function notifyPlacementChange(placement) {
  if (onPlacementChange) onPlacementChange(placement);
}

/**
 * The uid the running game belongs to.
 *
 * FarmScene uses this to namespace its saved layout in localStorage. Without
 * it, every account on a browser shared one `wattfarm_placement` key, so the
 * next player to log in inherited the previous player's farm.
 *
 * @returns {string | null}
 */
export function getCurrentUserId() {
  return currentUserId;
}

/**
 * Boots the Phaser game for a specific user.
 *
 * Idempotent for the same uid, so React re-renders will not recreate the
 * canvas. When the uid changes the previous instance is torn down first,
 * guaranteeing no state carries across accounts.
 *
 * @param {string} userId Firebase uid of the signed-in player
 */
export function boot(userId) {
  if (!userId) {
    console.warn('[game] boot() called without a userId — refusing to start');
    return;
  }

  if (game) {
    if (currentUserId === userId) return; // already running for this player
    shutdown(); // different account: start clean
  }

  currentUserId = userId;

  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'phaser-root',
    width: 960,
    height: 640,
    backgroundColor: '#0B1622',
    pixelArt: true,
    antialias: false,
    scene: [BootScene, FarmScene],
  });
}

/**
 * Destroys the running game and clears the associated identity.
 * Called on logout and when the mounting component unmounts.
 */
export function shutdown() {
  if (!game) {
    currentUserId = null;
    return;
  }

  try {
    // `false` for removeCanvas: React owns the #phaser-root element.
    game.destroy(true, false);
  } catch (err) {
    console.warn('[game] error during shutdown:', err);
  } finally {
    game = null;
    currentUserId = null;
  }
}

export function sync(assets, mountCount, solarCount) {
  if (!game) return;
  var farm = game.scene.getScene('FarmScene');
  if (farm) {
    if (farm.syncAssets) farm.syncAssets(assets, mountCount);
    if (farm.updateMountCount) farm.updateMountCount(mountCount);
    if (farm.updateSolarCount) farm.updateSolarCount(solarCount);
  }
}
