import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { notifyPlacementChange, getCurrentUserId } from '../GameInstance.js';

const TILE = 96;
const GRID_OFFSET_X = 96;
const GRID_OFFSET_Y = 24;
const TOOLBAR_H = 40;
const GRID_COLS = 8;
const GRID_ROWS_START = 2; // skip sky rows
const GRID_ROWS_END = 5;

/**
 * Mount definitions, with slot offsets measured from the sprite artwork.
 *
 * How the numbers were derived (all values in source pixels):
 *
 *   panel-1.png       64x64   top surface spans x 17..60, centre 38.5 → +6.5 from canvas centre
 *   mount-1.png       64x64   top surface spans x 17..60, centre 38.5 → +6.5 from canvas centre
 *   mount-2.png      128x64   top surface spans x 27..114 (width 88 = 2 x 44)
 *                             left bay  27..70  centre 48.5 → -15.5 from canvas centre
 *                             right bay 71..114 centre 92.5 → +28.5 from canvas centre
 *
 * The panel and the single mount share an identical footprint, so a panel on a
 * single mount needs no offset at all — it is drawn at the same point and simply
 * has to render above the frame. For the double mount, aligning the panel's own
 * +6.5 surface centre with each bay centre gives -15.5 - 6.5 = -22 and
 * 28.5 - 6.5 = +22.
 *
 * `cells` is how many grid columns the mount reserves. The double sprite is
 * 128px wide inside a 96px tile, so treating it as one cell made two adjacent
 * doubles overlap by 32px — which is what made one appear to sit on top of the
 * other. Reserving two columns removes the overlap entirely.
 */
const MOUNT_TYPES = {
  mount_single: {
    texture: 'mount_single',
    cells: 1,
    label: 'Mount 1x',
    slots: [{ dx: 0, dy: 0 }],
  },
  mount_double: {
    texture: 'mount_double',
    cells: 2,
    label: 'Mount 2x',
    slots: [
      { dx: -22, dy: 0 },
      { dx: 22, dy: 0 },
    ],
  },
};

/** Panels are children of their mount, so only mounts need a depth. */
const DEPTH_BASE = 10;

export default class FarmScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FarmScene' });

    /** @type {Phaser.GameObjects.Container[]} mount containers, each owning its panels */
    this.mounts = [];
    /** @type {Map<string, Phaser.GameObjects.Container>} "col,row" → mount occupying that cell */
    this.occupancy = new Map();

    this.editMode = false;
    this.editGrid = [];
    this.editAddButtons = [];

    this.mountsOwned = 0;
    this.doubleMountsOwned = 0;
    this.solarsOwned = 0;

    this.popupContainer = null;
  }

  create() {
    const bgImg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_game');
    bgImg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.entityLayer = this.add.container(0, 0).setDepth(10);

    this.createEditButton();
    this.restorePlacement();

    this.game.events.emit('ready');
  }

  /* ══ GEOMETRY ══ */

  cellCentreX(col) {
    return GRID_OFFSET_X + col * TILE + TILE / 2;
  }

  cellCentreY(row) {
    return GRID_OFFSET_Y + row * TILE + TILE / 2;
  }

  /**
   * Where a mount's container sits.
   *
   * A single mount is centred on its cell. A double spans two columns, so it is
   * centred on the boundary between them — otherwise its two bays would sit
   * off-centre over the reserved area.
   */
  mountPosition(type, col, row) {
    const def = MOUNT_TYPES[type];
    const x = this.cellCentreX(col) + ((def.cells - 1) * TILE) / 2;
    return { x, y: this.cellCentreY(row) };
  }

  /**
   * Render order.
   *
   * Row is the primary axis: rows further down the screen are nearer the viewer
   * and must draw on top. Within a row, lower columns draw on top, so a mount
   * is never covered by its neighbour to the right — the previous code used the
   * column as the primary axis, which produced exactly that artefact.
   */
  mountDepth(col, row) {
    return DEPTH_BASE + row * 100 + (GRID_COLS - col);
  }

  cellKey(col, row) {
    return `${col},${row}`;
  }

  /** Cells a mount of `type` anchored at (col,row) would reserve. */
  cellsFor(type, col, row) {
    const def = MOUNT_TYPES[type];
    const cells = [];
    for (let i = 0; i < def.cells; i += 1) cells.push({ col: col + i, row });
    return cells;
  }

  /** True when every cell the mount needs is inside the grid and free. */
  canPlaceAt(type, col, row) {
    const cells = this.cellsFor(type, col, row);
    return cells.every(
      (cell) =>
        cell.col >= 0 &&
        cell.col < GRID_COLS &&
        cell.row >= GRID_ROWS_START &&
        cell.row <= GRID_ROWS_END &&
        !this.occupancy.has(this.cellKey(cell.col, cell.row))
    );
  }

  mountAt(col, row) {
    return this.occupancy.get(this.cellKey(col, row)) || null;
  }

  /* ══ COUNTS ══ */

  countPlaced(type) {
    return this.mounts.filter((m) => m.getData('mountType') === type).length;
  }

  countPlacedPanels() {
    return this.mounts.reduce(
      (total, mount) => total + mount.getData('panels').filter(Boolean).length,
      0
    );
  }

  availableMounts(type) {
    const owned = type === 'mount_double' ? this.doubleMountsOwned : this.mountsOwned;
    return owned - this.countPlaced(type);
  }

  availablePanels() {
    return this.solarsOwned - this.countPlacedPanels();
  }

  /* ══ EDIT MODE ══ */

  createEditButton() {
    const y = GAME_HEIGHT - TOOLBAR_H / 2;
    this.add
      .rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, TOOLBAR_H, 0x131f2e, 0.9)
      .setDepth(80)
      .setStrokeStyle(1, 0x2a3b4d);

    this.editBtn = this.add
      .text(GAME_WIDTH / 2, y, 'EDIT', {
        fontFamily: '"Silkscreen", cursive',
        fontSize: '13px',
        color: '#F2B84B',
        backgroundColor: '#1A1A2A',
        padding: { x: 16, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(81)
      .setInteractive({ useHandCursor: true });

    this.editBtn.on('pointerover', () => this.editBtn.setColor('#FFFFFF'));
    this.editBtn.on('pointerout', () =>
      this.editBtn.setColor(this.editMode ? '#5FD4C4' : '#F2B84B')
    );
    this.editBtn.on('pointerdown', () => this.toggleEditMode());
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.hidePopup();

    if (this.editMode) {
      this.editBtn.setText('EXIT EDIT');
      this.editBtn.setColor('#5FD4C4');
      this.showEditGrid();
    } else {
      this.editBtn.setText('EDIT');
      this.editBtn.setColor('#F2B84B');
      this.hideEditGrid();
    }
  }

  showEditGrid() {
    this.hideEditGrid();

    for (let row = GRID_ROWS_START; row <= GRID_ROWS_END; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const cx = this.cellCentreX(col);
        const cy = this.cellCentreY(row);

        this.editGrid.push(
          this.add
            .rectangle(cx, cy, TILE, TILE, 0x0b1622, 0.25)
            .setDepth(5)
            .setStrokeStyle(0.5, 0x2a3b4d, 0.15)
        );

        if (this.mountAt(col, row)) continue;

        const addBtn = this.add
          .text(cx, cy, 'ADD', {
            fontFamily: '"Silkscreen", cursive',
            fontSize: '10px',
            color: '#F2B84B',
            backgroundColor: 'rgba(19, 31, 46, 0.85)',
            padding: { x: 10, y: 6 },
          })
          .setOrigin(0.5)
          .setDepth(6)
          .setInteractive({ useHandCursor: true });

        addBtn.on('pointerover', () => {
          addBtn.setColor('#FFFFFF');
          addBtn.setBackgroundColor('rgba(42, 42, 58, 0.9)');
        });
        addBtn.on('pointerout', () => {
          addBtn.setColor('#F2B84B');
          addBtn.setBackgroundColor('rgba(19, 31, 46, 0.85)');
        });
        addBtn.on('pointerdown', () => this.showAddPopup(col, row));

        this.editAddButtons.push(addBtn);
      }
    }
  }

  hideEditGrid() {
    for (const g of this.editGrid) g.destroy();
    for (const b of this.editAddButtons) b.destroy();
    this.editGrid = [];
    this.editAddButtons = [];
  }

  refreshEditGrid() {
    if (!this.editMode) return;
    this.hideEditGrid();
    this.showEditGrid();
  }

  /* ══ POPUP HELPERS ══ */

  hidePopup() {
    if (this.popupContainer) {
      this.popupContainer.destroy();
      this.popupContainer = null;
    }
  }

  /**
   * Builds a popup shell and returns it plus a cursor for stacking rows.
   * Height is passed in because the caller knows how many rows it will add.
   */
  createPopup(title, width, height, anchorY) {
    this.hidePopup();

    const menu = this.add.container(GAME_WIDTH / 2, Math.max(70, anchorY)).setDepth(200);

    const bg = this.add
      .rectangle(0, 0, width, height, 0x131f2e, 0.96)
      .setStrokeStyle(1, 0x8b7355);
    // Swallow clicks so tapping the panel does not fall through to the scene.
    bg.setInteractive();
    bg.on('pointerdown', () => {});
    menu.add(bg);

    menu.add(
      this.add
        .text(0, -height / 2 + 16, title, {
          fontFamily: '"Silkscreen", cursive',
          fontSize: '13px',
          color: '#F2B84B',
        })
        .setOrigin(0.5)
    );

    menu.add(this.add.rectangle(0, -height / 2 + 32, width - 20, 1, 0x8b7355, 0.3));

    const close = this.add
      .text(width / 2 - 14, -height / 2 + 14, '✕', {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: '#7C8CA0',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor('#E8EDF2'));
    close.on('pointerout', () => close.setColor('#7C8CA0'));
    close.on('pointerdown', () => this.hidePopup());
    menu.add(close);

    this.popupContainer = menu;
    return menu;
  }

  /** Adds a clickable row to a popup. `enabled: false` renders it greyed out. */
  addPopupButton(menu, { x = 0, y, label, enabled = true, tone = 'default', onClick }) {
    const colours = {
      default: { idle: '#F2B84B', bg: '#1A1A2A', hover: '#FFFFFF' },
      danger: { idle: '#E8EDF2', bg: '#2A1A1A', hover: '#FF6B6B' },
    };
    const palette = colours[tone] || colours.default;

    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        color: enabled ? palette.idle : '#5A6675',
        backgroundColor: enabled ? palette.bg : '#141A21',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: enabled });

    if (enabled) {
      btn.on('pointerover', () => btn.setColor(palette.hover));
      btn.on('pointerout', () => btn.setColor(palette.idle));
      btn.on('pointerdown', () => onClick());
    }

    menu.add(btn);
    return btn;
  }

  /* ══ PLACE MOUNT ══ */

  showAddPopup(col, row) {
    const anchorY = this.cellCentreY(row) - 70;
    const menu = this.createPopup('Place Mount', 280, 108, anchorY);

    const singleAvail = this.availableMounts('mount_single');
    const doubleAvail = this.availableMounts('mount_double');

    // A double needs the neighbouring column as well, so it can be unavailable
    // purely for lack of room — worth saying explicitly rather than just
    // greying the button out.
    const doubleFits = this.canPlaceAt('mount_double', col, row);

    this.addPopupButton(menu, {
      x: -70,
      y: 8,
      label: `Mount 1x  (${Math.max(0, singleAvail)})`,
      enabled: singleAvail > 0,
      onClick: () => {
        this.placeMount('mount_single', col, row);
        this.hidePopup();
      },
    });

    this.addPopupButton(menu, {
      x: 70,
      y: 8,
      label: `Mount 2x  (${Math.max(0, doubleAvail)})`,
      enabled: doubleAvail > 0 && doubleFits,
      onClick: () => {
        this.placeMount('mount_double', col, row);
        this.hidePopup();
      },
    });

    menu.add(
      this.add
        .text(
          0,
          38,
          doubleAvail > 0 && !doubleFits
            ? 'Mount 2x needs two free cells side by side'
            : 'Mount 2x occupies two cells and holds two panels',
          {
            fontFamily: 'Inter, sans-serif',
            fontSize: '10px',
            color: doubleAvail > 0 && !doubleFits ? '#FF6B6B' : '#7C8CA0',
          }
        )
        .setOrigin(0.5)
    );
  }

  placeMount(type, col, row) {
    if (this.availableMounts(type) <= 0) {
      this.showFlash('No mounts available');
      return;
    }

    if (!this.canPlaceAt(type, col, row)) {
      this.showFlash(
        MOUNT_TYPES[type].cells > 1 ? 'Needs two free cells side by side' : 'Cell occupied'
      );
      return;
    }

    this.createMount(type, col, row, []);
    this.commit();
  }

  /* ══ ENTITY CONSTRUCTION ══ */

  /**
   * Creates a mount container and its panels.
   *
   * Panels are children of this container rather than independent entities.
   * That is what guarantees a panel always renders above its own frame and
   * moves and is removed with it — previously both were separate objects at the
   * same cell competing for depth, so a panel could disappear behind its mount.
   *
   * @param {'mount_single'|'mount_double'} type
   * @param {number} col anchor column (leftmost cell)
   * @param {number} row
   * @param {boolean[]} panelFlags which bays start filled
   */
  createMount(type, col, row, panelFlags = []) {
    const def = MOUNT_TYPES[type];
    if (!def) return null;

    const { x, y } = this.mountPosition(type, col, row);

    const container = this.add.container(x, y);
    container.setData('mountType', type);
    container.setData('gridCol', col);
    container.setData('gridRow', row);
    container.setData('panels', new Array(def.slots.length).fill(null));

    // Hit area covers every reserved cell so the whole footprint is clickable.
    container.setSize(TILE * def.cells, TILE);
    container.setDepth(this.mountDepth(col, row));
    container.setInteractive({ useHandCursor: true });

    // The frame is added first, so any panel added later sits above it.
    const frame = this.add.image(0, 0, def.texture);
    container.add(frame);
    container.setData('frame', frame);

    container.on('pointerdown', () => {
      if (!this.editMode) return;
      this.showMountPopup(container);
    });

    this.entityLayer.add(container);

    this.mounts.push(container);
    for (const cell of this.cellsFor(type, col, row)) {
      this.occupancy.set(this.cellKey(cell.col, cell.row), container);
    }

    // Restore panels, ignoring flags beyond this mount's slot count.
    def.slots.forEach((_slot, index) => {
      if (panelFlags[index]) this.attachPanel(container, index, { silent: true });
    });

    return container;
  }

  /**
   * Adds a panel sprite into one bay of a mount.
   *
   * @param {Phaser.GameObjects.Container} mount
   * @param {number} slotIndex
   * @param {{ silent?: boolean }} options `silent` skips the inventory check,
   *   used when restoring a saved layout before inventory has synced.
   */
  attachPanel(mount, slotIndex, { silent = false } = {}) {
    const type = mount.getData('mountType');
    const def = MOUNT_TYPES[type];
    const slot = def.slots[slotIndex];
    if (!slot) return false;

    const panels = mount.getData('panels');
    if (panels[slotIndex]) {
      if (!silent) this.showFlash('Bay already has a panel');
      return false;
    }

    if (!silent && this.availablePanels() <= 0) {
      this.showFlash('No panels available');
      return false;
    }

    const sprite = this.add.image(slot.dx, slot.dy, 'solar_panel');
    mount.add(sprite);
    panels[slotIndex] = sprite;
    mount.setData('panels', panels);

    return true;
  }

  detachPanel(mount, slotIndex) {
    const panels = mount.getData('panels');
    const sprite = panels[slotIndex];
    if (!sprite) return false;

    sprite.destroy();
    panels[slotIndex] = null;
    mount.setData('panels', panels);
    return true;
  }

  removeMount(mount) {
    const type = mount.getData('mountType');
    const col = mount.getData('gridCol');
    const row = mount.getData('gridRow');

    // Destroying the container also destroys its panel children.
    for (const cell of this.cellsFor(type, col, row)) {
      this.occupancy.delete(this.cellKey(cell.col, cell.row));
    }
    this.mounts = this.mounts.filter((m) => m !== mount);
    mount.destroy();
  }

  /* ══ MOUNT POPUP ══ */

  showMountPopup(mount) {
    const type = mount.getData('mountType');
    const def = MOUNT_TYPES[type];
    const row = mount.getData('gridRow');
    const panels = mount.getData('panels');

    const rowHeight = 26;
    const height = 74 + def.slots.length * rowHeight;
    const anchorY = this.cellCentreY(row) - height / 2 - 20;

    const menu = this.createPopup(def.label, 290, height, anchorY);

    let y = -height / 2 + 50;

    def.slots.forEach((_slot, index) => {
      const filled = !!panels[index];
      const bayLabel = def.slots.length > 1 ? `Bay ${index + 1}` : 'Panel';

      menu.add(
        this.add
          .text(-118, y, bayLabel, {
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            color: filled ? '#F2B84B' : '#7C8CA0',
          })
          .setOrigin(0, 0.5)
      );

      if (filled) {
        this.addPopupButton(menu, {
          x: 48,
          y,
          label: 'Remove panel',
          tone: 'danger',
          onClick: () => {
            this.detachPanel(mount, index);
            this.showFlash('Panel returned to storage');
            this.commit();
            this.showMountPopup(mount); // reopen so further edits are possible
          },
        });
      } else {
        const canAdd = this.availablePanels() > 0;
        this.addPopupButton(menu, {
          x: 48,
          y,
          label: canAdd ? `Add panel (${this.availablePanels()})` : 'No panels in storage',
          enabled: canAdd,
          onClick: () => {
            if (this.attachPanel(mount, index)) {
              this.commit();
              this.showMountPopup(mount);
            }
          },
        });
      }

      y += rowHeight;
    });

    this.addPopupButton(menu, {
      y: height / 2 - 20,
      label: 'Remove mount',
      onClick: () => {
        this.removeMount(mount);
        this.showFlash('Returned to storage');
        this.commit();
        this.hidePopup();
      },
    });
  }

  /* ══ FLASH ══ */

  showFlash(text) {
    const msg = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - TOOLBAR_H - 30, text, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: '#F2B84B',
        backgroundColor: '#131f2e',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(99);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - 30,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => msg.destroy(),
    });
  }

  /* ══ PERSISTENCE ══ */

  /**
   * Storage key for the current player's farm layout.
   *
   * Scoped by Firebase uid: a single global `wattfarm_placement` key was shared
   * by every account on the browser, so logging in as someone else restored the
   * previous player's farm. Returns null when no user is known, which disables
   * persistence rather than risking a write to a shared key.
   */
  placementStorageKey() {
    const uid = getCurrentUserId();
    return uid ? `wattfarm:placement:${uid}` : null;
  }

  savePlacement() {
    const key = this.placementStorageKey();
    if (!key) return;

    const payload = {
      v: 2,
      mounts: this.mounts.map((mount) => ({
        type: mount.getData('mountType'),
        col: mount.getData('gridCol'),
        row: mount.getData('gridRow'),
        panels: mount.getData('panels').map(Boolean),
      })),
    };

    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      // Quota exceeded or storage disabled (private browsing). The farm still
      // works for this session; it just will not survive a reload.
      console.warn('[game] could not save placement:', e?.name || e);
    }
  }

  /**
   * Removes the pre-namespacing key, which is no longer read but would
   * otherwise leave one player's farm in another's storage indefinitely.
   */
  discardLegacyPlacement() {
    try {
      if (localStorage.getItem('wattfarm_placement') !== null) {
        localStorage.removeItem('wattfarm_placement');
      }
    } catch {
      // Storage unavailable — nothing to clean up.
    }
  }

  /**
   * Converts the v1 format (a flat array where panels were separate entries at
   * the same cell) into the current shape, so existing farms survive the
   * change instead of silently vanishing.
   */
  migrateLegacyLayout(items) {
    const mounts = [];
    const panelCells = new Set();

    for (const item of items) {
      if (item?.type === 'solar') {
        panelCells.add(`${item.col},${item.row}`);
      } else if (item?.type === 'mount_single' || item?.type === 'mount_double') {
        mounts.push({ type: item.type, col: item.col, row: item.row, panels: [] });
      }
    }

    // A v1 cell held at most one panel, so it maps onto the first bay.
    for (const mount of mounts) {
      if (panelCells.has(`${mount.col},${mount.row}`)) mount.panels = [true];
    }

    return mounts;
  }

  restorePlacement() {
    this.discardLegacyPlacement();

    const key = this.placementStorageKey();
    if (!key) return;

    let raw;
    try {
      raw = JSON.parse(localStorage.getItem(key));
    } catch {
      // Corrupted entry — discard so the player is not stuck with a farm that
      // can never load.
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
      return;
    }

    if (!raw) return;

    const mounts = Array.isArray(raw)
      ? this.migrateLegacyLayout(raw)
      : Array.isArray(raw.mounts)
        ? raw.mounts
        : [];

    let skipped = 0;

    for (const entry of mounts) {
      if (!MOUNT_TYPES[entry?.type]) continue;

      const col = Number(entry.col);
      const row = Number(entry.row);
      if (!Number.isInteger(col) || !Number.isInteger(row)) continue;

      // A saved double may no longer fit — the layout could predate the
      // two-cell rule and overlap its neighbour.
      if (!this.canPlaceAt(entry.type, col, row)) {
        skipped += 1;
        continue;
      }

      this.createMount(entry.type, col, row, Array.isArray(entry.panels) ? entry.panels : []);
    }

    if (skipped > 0) {
      console.warn(`[game] skipped ${skipped} saved mount(s) that no longer fit the grid`);
    }

    // Persist immediately so a migrated or pruned layout is written in the
    // current format rather than re-migrated on every load.
    this.emitPlacement();
    this.savePlacement();
  }

  /* ══ REACT SYNC ══ */

  /** Saves and notifies React. Called after every mutation. */
  commit() {
    this.emitPlacement();
    this.savePlacement();
    this.refreshEditGrid();
  }

  emitPlacement() {
    const totalMounts = this.countPlaced('mount_single') + this.countPlaced('mount_double');
    notifyPlacementChange(this.countPlacedPanels(), totalMounts);
  }

  updateMountCount(mc) {
    this.mountsOwned = typeof mc === 'number' ? mc : this.mountsOwned || 0;
  }

  updateSolarCount(sc) {
    this.solarsOwned = typeof sc === 'number' ? sc : this.solarsOwned || 0;
  }

  syncAssets(assetList, mountCount) {
    this.mountsOwned = typeof mountCount === 'number' ? mountCount : 0;

    let doubles = 0;
    if (Array.isArray(assetList)) {
      const solar = assetList.find((a) => a.type === 'solar');
      if (solar) this.solarsOwned = solar.quantity;

      const doubleMount = assetList.find((a) => a.type === 'panel-mount-double');
      if (doubleMount) doubles = doubleMount.quantity;
    }
    this.doubleMountsOwned = doubles;

    // The open popup shows availability counts, which have just changed.
    if (this.popupContainer) this.hidePopup();
    this.refreshEditGrid();
  }
}
