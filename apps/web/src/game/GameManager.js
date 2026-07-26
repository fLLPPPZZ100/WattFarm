/**
 * Lightweight helpers — no singleton, no global state.
 * Each PhaserFarm component instance owns its game lifecycle.
 */

export { BootScene, FarmScene } from './scenes/index.js';

/**
 * Creates a Phaser.Game bound to a specific DOM element.
 * Returns the instance for the caller to manage.
 */
export function createGameInstance(parentId, gameFactory) {
  return gameFactory(parentId);
}

/**
 * Safely destroys a Phaser.Game instance.
 * Prevents conflicts with React DOM management.
 */
export function destroyGameInstance(game) {
  if (!game) return;
  try {
    // Stop all scenes first
    game.scene.scenes.forEach(function (s) {
      if (s.scene.isActive()) {
        s.scene.stop();
      }
    });
    // Destroy without removing canvas (React handles DOM)
    game.destroy(false, false);
  } catch (e) {
    // Silently ignore — game was already partially destroyed
  }
}