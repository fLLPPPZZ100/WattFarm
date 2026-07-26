import Phaser from 'phaser';
import { createGameConfig } from './config.js';

/**
 * Creates and returns a Phaser.Game instance.
 * Does NOT start it — the caller owns the lifecycle.
 *
 * @param {string} parentId - DOM element id to mount the canvas into
 * @param {Phaser.Scene[]} scenes - Array of scene classes
 * @returns {Phaser.Game}
 */
export function createGame(parentId, scenes) {
  const config = createGameConfig(parentId, scenes);
  return new Phaser.Game(config);
}