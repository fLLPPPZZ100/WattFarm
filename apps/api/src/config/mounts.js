/**
 * Farm grid and mount definitions — the authoritative copy.
 *
 * The client has its own copy of the *visual* half of this (sprite offsets, bay
 * pixel positions) in apps/web/src/game/scenes/FarmScene.js, but every value
 * that affects income lives here and is validated here. A client that disagrees
 * can only produce a wrong-looking farm, never a richer one.
 *
 * Keep `cells`, `bays` and `powerBonus` in sync with the client's MOUNT_TYPES,
 * otherwise the player sees a layout the server will reject.
 */

/** Grid dimensions. Matches the grass band measured from the background art. */
export const GRID = Object.freeze({
  cols: 14,
  rows: 4,
});

/** Watts per second produced by a single panel before any mount bonus. */
export const PANEL_BASE_W = 1;

/**
 * `cells` — grid columns the mount occupies, starting at its anchor.
 * `bays`  — how many panels it can carry.
 * `powerBonus` — multiplier applied to every panel on it. This is what makes a
 *   wider mount worth buying: it costs more per watt but yields more per cell,
 *   so money buys space efficiency.
 */
export const MOUNT_TYPES = Object.freeze({
  mount_single: Object.freeze({
    assetType: 'panel-mount',
    cells: 1,
    bays: 1,
    powerBonus: 0,
  }),
  mount_double: Object.freeze({
    assetType: 'panel-mount-double',
    cells: 2,
    bays: 2,
    powerBonus: 0.25,
  }),
});

export const MOUNT_TYPE_IDS = Object.freeze(Object.keys(MOUNT_TYPES));

/** Asset type of the panels that go into bays. */
export const PANEL_ASSET_TYPE = 'solar';

/**
 * Cells occupied by a mount anchored at (col, row).
 * @returns {{col:number,row:number}[]}
 */
export function cellsFor(type, col, row) {
  const def = MOUNT_TYPES[type];
  if (!def) return [];

  const cells = [];
  for (let i = 0; i < def.cells; i += 1) cells.push({ col: col + i, row });
  return cells;
}

/** True when every cell the mount needs is inside the grid. */
export function withinGrid(type, col, row) {
  return cellsFor(type, col, row).every(
    (cell) => cell.col >= 0 && cell.col < GRID.cols && cell.row >= 0 && cell.row < GRID.rows
  );
}

/** Effective output of one panel on the given mount type, in W/s. */
export function panelOutput(type) {
  const def = MOUNT_TYPES[type];
  if (!def) return 0;
  return PANEL_BASE_W * (1 + def.powerBonus);
}

/**
 * Serialisable view of the rules, sent to the client so the UI can show bays
 * and bonuses without hardcoding a second source of truth for them.
 */
export function publicConfig() {
  return {
    grid: { ...GRID },
    panelBaseW: PANEL_BASE_W,
    mounts: Object.fromEntries(
      Object.entries(MOUNT_TYPES).map(([id, def]) => [
        id,
        { cells: def.cells, bays: def.bays, powerBonus: def.powerBonus, assetType: def.assetType },
      ])
    ),
  };
}

export default MOUNT_TYPES;
