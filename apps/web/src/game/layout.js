/**
 * Canvas geometry shared by the Phaser scene and the React overlay.
 *
 * The stats panel is HTML, but the cable that feeds it is drawn inside the
 * canvas. For the two to look connected they must agree on exactly where the
 * connection happens, so the numbers live here instead of being repeated on
 * both sides — a 4px disagreement is visible as a broken wire.
 *
 * The panel is positioned over the canvas rather than beside it. Placing it
 * outside would mean converting between canvas and page coordinates, which
 * breaks the moment the viewport changes; overlaying it means the cable ends at
 * the panel's edge in the same coordinate space it was drawn in.
 */

export const CANVAS = { width: 960, height: 640 };

/** Height of the bottom bar holding the EDIT button. */
export const TOOLBAR_H = 40;

/**
 * Build grid.
 *
 * Three rows, per the current design. Solid grass starts at canvas y=348 and the
 * toolbar at y=600, so 3 rows of 64px placed at 376 span 376..568 — clear of the
 * tree line above and the toolbar below.
 *
 * The left offset reserves the strip the stats panel occupies.
 */
export const GRID = {
  tile: 64,
  cols: 11,
  rows: 3,
  offsetX: 224, // 224 + 11*64 = 928, leaving a 32px right margin
  offsetY: 376,
};

/**
 * The stats panel, in canvas coordinates.
 *
 * `connectorY` is where the trunk cable meets its right edge: the vertical
 * centre of the rows, so the wire runs straight into the middle of the panel.
 */
export const STATION = {
  left: 16,
  width: 176,
  height: 200,
  get right() {
    return this.left + this.width;
  },
  get connectorY() {
    return GRID.offsetY + (GRID.rows * GRID.tile) / 2; // 472
  },
  get top() {
    return this.connectorY - this.height / 2; // 372
  },
};

/** Vertical trunk that gathers every row and runs to the station. */
export const TRUNK_X = 208;

/** Payout cycle length, matching the server cron. */
export const CYCLE_SECONDS = 600;

/** Centre of a grid cell, in canvas coordinates. */
export function cellCentreX(col) {
  return GRID.offsetX + col * GRID.tile + GRID.tile / 2;
}

export function cellCentreY(row) {
  return GRID.offsetY + row * GRID.tile + GRID.tile / 2;
}
