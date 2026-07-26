/**
 * Canvas geometry shared by the Phaser scene and the React overlay.
 *
 * The stats panel is HTML sitting *beside* the canvas, but the cable that feeds
 * it is drawn *inside* the canvas. For the wire to look continuous across that
 * boundary, both sides must agree on the exact height at which it crosses — so
 * the numbers live here rather than being repeated in two files, where a few
 * pixels of drift shows up as a severed cable.
 *
 * Alignment works because the panel and the canvas are laid out as a single
 * centred flex pair with the same top edge: the panel's connector sits at
 * `connectorY` measured from that shared top, and the scene draws the cable out
 * to the canvas's left edge at the same `connectorY`.
 */

export const CANVAS = { width: 960, height: 640 };

/** Height of the bottom bar holding the EDIT button. */
export const TOOLBAR_H = 40;

/**
 * Build grid.
 *
 * Three rows, per the current design. Solid grass starts at canvas y=348 and the
 * toolbar at y=600, so three 64px rows placed at 376 span 376..568 — clear of the
 * tree line above and the toolbar below.
 *
 * The left offset only has to clear the trunk cable, since the stats panel is
 * outside the canvas now.
 */
export const GRID = {
  tile: 64,
  cols: 14,
  rows: 3,
  offsetX: 32, // 32 + 14*64 = 928, leaving a 32px right margin
  offsetY: 376,
};

/**
 * Vertical trunk that gathers every row, near the left edge so it has room to
 * run without touching the first column of mounts.
 */
export const TRUNK_X = 16;

/**
 * Where the cable leaves the canvas, in canvas coordinates. Zero is the very
 * edge; a couple of pixels in keeps the terminal block fully visible.
 */
export const CABLE_EXIT_X = 2;

/**
 * The stats panel, which lives to the left of the canvas.
 *
 * `top` is measured from the canvas's top edge, which the flex layout keeps
 * aligned with the panel's own top.
 */
export const STATION = {
  width: 176,
  height: 200,
  /** Vertical centre of the rows, so the wire runs into the middle of the panel. */
  get connectorY() {
    return GRID.offsetY + (GRID.rows * GRID.tile) / 2; // 472
  },
  get top() {
    return this.connectorY - this.height / 2; // 372
  },
};

/** Payout cycle length, matching the server cron. */
export const CYCLE_SECONDS = 600;

/** Centre of a grid cell, in canvas coordinates. */
export function cellCentreX(col) {
  return GRID.offsetX + col * GRID.tile + GRID.tile / 2;
}

export function cellCentreY(row) {
  return GRID.offsetY + row * GRID.tile + GRID.tile / 2;
}
