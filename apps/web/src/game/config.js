/**
 * Canvas dimensions, shared by the scenes and by the React layout.
 *
 * `AppShell` sizes `#phaser-root` from the same numbers and anchors the side
 * panels to them, so a mismatch here shifts those panels off the canvas edge.
 *
 * This file used to also export `createGameConfig()` and a `TILE_SIZE` of 32.
 * Both were dead: `GameInstance.boot()` builds its Phaser config inline, and
 * the grid settled on a 64px tile defined in `FarmScene` (where the artwork it
 * is measured from lives).
 */

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
