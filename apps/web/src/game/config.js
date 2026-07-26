import Phaser from 'phaser';

// Phaser 3 game configuration for WattFarm
// Pixel art mode — no antialias, no smoothing.
// Scale is disabled — the React container handles sizing via CSS flexbox.

export const TILE_SIZE = 32;
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;

export function createGameConfig(parent, scenes) {
  return {
    type: Phaser.AUTO,
    parent: parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0B1622',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.NONE,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
    },
    scene: scenes,
  };
}