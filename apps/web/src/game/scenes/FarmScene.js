import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { notifyPlacementChange, getCurrentUserId } from '../GameInstance.js';
import { loadLayout, saveLayout } from '../farmApi.js';
import {
  C,
  CSS,
  FONT_DISPLAY,
  createPanel,
  createButton,
  createTitle,
  createLabel,
  createDivider,
  createToastManager,
  createGroundShadow,
  createSaggingCable,
} from '../ui/pixelUi.js';

/* ══════════════════════════════════════════════════════════════════════
   GRID GEOMETRY

   The tile is 64px because that is the unit the artwork was drawn on:

     mount-1.png   64px wide   = 1 tile
     mount-2.png  128px wide   = 2 tiles
     panel-1.png   64px wide   = 1 tile

   With the previous 96px tile, mounts sat 34px apart — a sparse row of
   floating frames — and the 128px double spilled 10px into its neighbour.

   The vertical bounds come from measuring the background: grass becomes
   solid at canvas y=348 and the toolbar starts at y=600. Four 64px rows
   from y=344 fill that band exactly. The old grid started at y=216, which
   put two of its four rows in the sky.
   ══════════════════════════════════════════════════════════════════════ */

const TILE = 64;
const GRID_COLS = 14;
const GRID_ROWS = 4;
const GRID_OFFSET_X = 32; // 32 + 14*64 = 928, leaving a 32px right margin
const GRID_OFFSET_Y = 344; // 344 + 4*64 = 600, exactly the toolbar line

const TOOLBAR_H = 40;

/**
 * Mount definitions. Slot offsets are measured from the sprites:
 *
 *   panel-1.png  surface x 17..60, centre 38.5  → +6.5 from canvas centre
 *   mount-1.png  surface x 17..60, centre 38.5  → +6.5 (identical to panel)
 *   mount-2.png  surface x 27..114 (88 = 2 x 44)
 *                left bay  centre 48.5 → -15.5 from canvas centre
 *                right bay centre 92.5 → +28.5 from canvas centre
 *
 * The panel and single mount share a footprint exactly, so a panel needs no
 * offset there. Aligning the panel's own +6.5 surface centre with each bay of
 * the double gives -15.5 - 6.5 = -22 and 28.5 - 6.5 = +22.
 *
 * `powerBonus` multiplies the output of panels on that mount. It is what makes
 * a wider mount worth buying: it costs more per watt but produces more per
 * cell, so money buys space efficiency. Note the bonus is presentational until
 * placement becomes server-authoritative — see DECISIONS/PR B.
 */
const MOUNT_TYPES = {
  mount_single: {
    texture: 'mount_single',
    cells: 1,
    label: 'Mount 1x',
    powerBonus: 0,
    slots: [{ dx: 0, dy: 0 }],
    // Feet touch the ground at container y=+28, spanning x -26..+24 (51px).
    shadowWidth: 54,
  },
  mount_double: {
    texture: 'mount_double',
    cells: 2,
    label: 'Mount 2x',
    powerBonus: 0.25,
    slots: [
      { dx: -22, dy: 0 },
      { dx: 22, dy: 0 },
    ],
    // Feet touch the ground at container y=+28, spanning x -48..+46 (95px).
    shadowWidth: 98,
  },
};

/**
 * Cabling between powered mounts.
 *
 * Only mounts carrying at least one panel are wired: the cable is the visual
 * proof that a mount is actually generating, so an empty frame staying
 * unconnected is the point rather than an omission.
 *
 * `connectorInset` is how far in from the mount's footprint edge the cable
 * attaches, and `y` places it just above the feet so it reads as running along
 * the ground behind the frames.
 */
const CABLE = {
  y: 22,
  connectorInset: 6,
  colour: 0x101c26,
  step: 4,
  thickness: 2,
  /**
   * Droop is proportional to span, capped so a long run stays inside its own
   * cell: the cable sits at y=22 and the cell ends at y=32, so anything above
   * 8 would dip into the row below.
   */
  sagRatio: 0.14,
  maxSag: 8,
  /** Milliseconds between pulse advances — lower is faster. */
  pulseInterval: 55,
};

/**
 * Ground shadow placement, shared by both mounts.
 *
 * `y` is where the legs meet the grass, measured from the sprites: the last
 * opaque row of both textures is canvas y=60, which is +28 from the centre.
 * The sun in the background sits top-left, so the shadow is nudged right.
 */
const SHADOW = { y: 29, offsetX: 4, alpha: 0.26 };

/** Watts per second produced by one panel before mount bonuses. */
const PANEL_BASE_W = 1;

const DEPTH = {
  grid: 5,
  cellButton: 6,
  cables: 9,
  entities: 10,
  toolbar: 800,
  popup: 850,
  toast: 900,
};



export default class FarmScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FarmScene' });

    /** @type {Phaser.GameObjects.Container[]} mount containers, each owning its panels */
    this.mounts = [];
    /** @type {Map<string, Phaser.GameObjects.Container>} "col,row" → occupying mount */
    this.occupancy = new Map();

    this.editMode = false;
    this.editObjects = [];

    this.mountsOwned = 0;
    this.doubleMountsOwned = 0;
    this.solarsOwned = 0;

    this.popup = null;
    this.toasts = null;

    /* Server-owned figures, mirrored for display. */
    this.serverPowerRate = 0;
    this.networkBaseline = 0;

    /* Save coalescing — see queueSave(). */
    this.saveTimer = null;
    this.saveInFlight = false;
    this.savePending = false;
  }

  create() {
    const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_game');
    bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    // Cables sit behind the mounts so they read as running along the ground.
    this.cableLayer = this.add.container(0, 0).setDepth(DEPTH.cables);
    this.entityLayer = this.add.container(0, 0).setDepth(DEPTH.entities);

    /** @type {{ points: {x:number,y:number}[], dot: Phaser.GameObjects.Rectangle, glow: Phaser.GameObjects.Rectangle, index: number }[]} */
    this.pulses = [];

    // One timer drives every pulse, rather than a tween per cable.
    this.pulseTimer = this.time.addEvent({
      delay: CABLE.pulseInterval,
      loop: true,
      callback: () => this.advancePulses(),
    });

    this.toasts = createToastManager(this, {
      x: GAME_WIDTH / 2,
      baselineY: GAME_HEIGHT - TOOLBAR_H - 26,
      depth: DEPTH.toast,
    });

    this.createToolbar();

    // Fire and forget: the scene renders an empty farm immediately and fills in
    // when the server answers, rather than blocking the first frame.
    this.loadLayoutFromServer();

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
   * A single mount is centred on its cell; a double spans two columns and is
   * centred on the boundary between them, so its two bays sit over the area it
   * reserves rather than off to one side.
   */
  mountPosition(type, col, row) {
    const def = MOUNT_TYPES[type];
    return {
      x: this.cellCentreX(col) + ((def.cells - 1) * TILE) / 2,
      y: this.cellCentreY(row),
    };
  }

  /**
   * Render order. Row is the primary axis: rows further down the screen are
   * nearer the viewer and draw on top. Within a row, lower columns draw on top,
   * so a mount is never covered by its neighbour to the right.
   */
  mountDepth(col, row) {
    return row * 100 + (GRID_COLS - col);
  }

  cellKey(col, row) {
    return `${col},${row}`;
  }

  cellsFor(type, col, row) {
    const cells = [];
    for (let i = 0; i < MOUNT_TYPES[type].cells; i += 1) cells.push({ col: col + i, row });
    return cells;
  }

  inBounds(col, row) {
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
  }

  canPlaceAt(type, col, row) {
    return this.cellsFor(type, col, row).every(
      (cell) => this.inBounds(cell.col, cell.row) && !this.occupancy.has(this.cellKey(cell.col, cell.row))
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
    return this.mounts.reduce((n, m) => n + m.getData('panels').filter(Boolean).length, 0);
  }

  availableMounts(type) {
    const owned = type === 'mount_double' ? this.doubleMountsOwned : this.mountsOwned;
    return owned - this.countPlaced(type);
  }

  availablePanels() {
    return this.solarsOwned - this.countPlacedPanels();
  }

  /** Effective output of one panel on the given mount, including its bonus. */
  panelOutput(type) {
    return PANEL_BASE_W * (1 + MOUNT_TYPES[type].powerBonus);
  }

  /** Total effective W of everything currently placed. */
  totalPlacedOutput() {
    return this.mounts.reduce((total, mount) => {
      const type = mount.getData('mountType');
      const filled = mount.getData('panels').filter(Boolean).length;
      return total + filled * this.panelOutput(type);
    }, 0);
  }

  /* ══ TOOLBAR ══ */

  createToolbar() {
    const y = GAME_HEIGHT - TOOLBAR_H / 2;

    this.add
      .rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, TOOLBAR_H, C.panel, 0.96)
      .setDepth(DEPTH.toolbar);
    // Accent rule along the top edge, mirroring the web header.
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - TOOLBAR_H, GAME_WIDTH, 2, C.watt, 1)
      .setDepth(DEPTH.toolbar);

    this.editButton = createButton(this, {
      x: GAME_WIDTH / 2,
      y,
      label: 'EDIT',
      width: 108,
      height: 24,
      tone: 'primary',
      onClick: () => this.toggleEditMode(),
      depth: DEPTH.toolbar + 1,
    });

    // Live output readout, so the effect of an edit is visible immediately.
    this.outputLabel = createLabel(this, {
      x: GAME_WIDTH - 20,
      y,
      text: '',
      size: 11,
      color: CSS.current,
      origin: 1,
    }).setDepth(DEPTH.toolbar + 1);

    this.hintLabel = createLabel(this, {
      x: 20,
      y,
      text: 'Tap EDIT to build',
      size: 10,
      color: CSS.textMuted,
      origin: 0,
    }).setDepth(DEPTH.toolbar + 1);

    this.refreshToolbar();
  }

  refreshToolbar() {
    if (this.outputLabel) {
      const output = this.totalPlacedOutput();

      // Share of the simulated network, which is what actually decides the
      // payout — output alone tells the player nothing about their income.
      const total = output + this.networkBaseline;
      const share = total > 0 ? (output / total) * 100 : 0;

      this.outputLabel.setText(
        this.networkBaseline > 0
          ? `${output.toFixed(1)} W/s  ·  ${share.toFixed(1)}% of network`
          : `${output.toFixed(1)} W/s`
      );
    }

    if (this.hintLabel) {
      this.hintLabel.setText(
        this.editMode
          ? `${this.availablePanels()} panels · ${this.availableMounts('mount_single')} mounts 1x · ${this.availableMounts('mount_double')} mounts 2x`
          : 'Tap EDIT to build'
      );
    }

    if (this.editButton) {
      const text = this.editButton.list.find((o) => o.type === 'Text');
      if (text) text.setText(this.editMode ? 'DONE' : 'EDIT');
    }
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.hidePopup();

    if (this.editMode) this.showEditGrid();
    else this.hideEditGrid();

    this.refreshToolbar();
  }

  /* ══ EDIT GRID ══ */

  showEditGrid() {
    this.hideEditGrid();

    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        const cx = this.cellCentreX(col);
        const cy = this.cellCentreY(row);
        const occupied = !!this.mountAt(col, row);

        // Cell outline. Occupied cells are dimmer so free space reads first.
        const cell = this.add
          .rectangle(cx, cy, TILE - 2, TILE - 2, C.abyss, occupied ? 0.06 : 0.22)
          .setDepth(DEPTH.grid)
          .setStrokeStyle(1, occupied ? C.line : C.watt, occupied ? 0.25 : 0.4);
        this.editObjects.push(cell);

        if (occupied) continue;

        // A "+" marker rather than a wordy button — at 64px the cell is small,
        // and the glyph reads instantly.
        const plus = this.add
          .text(cx, cy, '+', {
            fontFamily: FONT_DISPLAY,
            fontSize: '16px',
            color: CSS.watt,
          })
          .setOrigin(0.5)
          .setDepth(DEPTH.cellButton)
          .setAlpha(0.75);

        const hit = this.add
          .rectangle(cx, cy, TILE - 2, TILE - 2, 0xffffff, 0)
          .setDepth(DEPTH.cellButton + 1)
          .setInteractive({ useHandCursor: true });

        hit.on('pointerover', () => {
          cell.setFillStyle(C.watt, 0.14);
          cell.setStrokeStyle(2, C.watt, 0.9);
          plus.setAlpha(1);
        });
        hit.on('pointerout', () => {
          cell.setFillStyle(C.abyss, 0.22);
          cell.setStrokeStyle(1, C.watt, 0.4);
          plus.setAlpha(0.75);
        });
        hit.on('pointerdown', () => this.showAddPopup(col, row));

        this.editObjects.push(plus, hit);
      }
    }
  }

  hideEditGrid() {
    for (const obj of this.editObjects) obj.destroy();
    this.editObjects = [];
  }

  refreshEditGrid() {
    if (!this.editMode) return;
    this.showEditGrid();
  }

  /* ══ POPUPS ══ */

  hidePopup() {
    if (this.popup) {
      this.popup.destroy();
      this.popup = null;
    }
  }

  /**
   * Creates a popup anchored above a row, clamped to stay on screen.
   * A full-screen catcher behind it closes the popup on an outside click.
   */
  openPopup({ title, width, height, row }) {
    this.hidePopup();

    const group = this.add.container(0, 0).setDepth(DEPTH.popup);

    const catcher = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, C.abyss, 0.35)
      .setInteractive();
    catcher.on('pointerdown', () => this.hidePopup());
    group.add(catcher);

    const anchorY = this.cellCentreY(row) - height / 2 - 24;
    const y = Phaser.Math.Clamp(anchorY, height / 2 + 12, GAME_HEIGHT - TOOLBAR_H - height / 2 - 12);

    const panel = createPanel(this, {
      x: GAME_WIDTH / 2,
      y,
      width,
      height,
      depth: DEPTH.popup + 1,
    });

    // Clicks on the panel must not reach the catcher behind it.
    const blocker = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setInteractive();
    blocker.on('pointerdown', () => {});
    panel.add(blocker);

    panel.add(createTitle(this, { y: -height / 2 + 16, text: title, size: 11 }));
    panel.add(createDivider(this, { y: -height / 2 + 28, width: width - 16 }));

    const close = createLabel(this, {
      x: width / 2 - 14,
      y: -height / 2 + 15,
      text: 'x',
      size: 12,
      color: CSS.textMuted,
    });
    close.setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor(CSS.textPrimary));
    close.on('pointerout', () => close.setColor(CSS.textMuted));
    close.on('pointerdown', () => this.hidePopup());
    panel.add(close);

    group.add(panel);
    this.popup = group;

    return panel;
  }

  /** Popup for an empty cell: choose which mount to install. */
  showAddPopup(col, row) {
    const width = 260;
    const height = 132;
    const panel = this.openPopup({ title: 'Install mount', width, height, row });

    const options = [
      { type: 'mount_single', x: -62 },
      { type: 'mount_double', x: 62 },
    ];

    for (const option of options) {
      const def = MOUNT_TYPES[option.type];
      const available = this.availableMounts(option.type);
      const fits = this.canPlaceAt(option.type, col, row);
      const enabled = available > 0 && fits;

      panel.add(
        createButton(this, {
          x: option.x,
          y: -12,
          width: 108,
          height: 26,
          label: def.label,
          tone: enabled ? 'primary' : 'ghost',
          enabled,
          onClick: () => {
            this.placeMount(option.type, col, row);
            this.hidePopup();
          },
        })
      );

      const detail =
        def.cells > 1
          ? `${def.cells} cells · ${def.slots.length} panels · +${Math.round(def.powerBonus * 100)}%`
          : `1 cell · 1 panel`;

      panel.add(
        createLabel(this, {
          x: option.x,
          y: 12,
          text: detail,
          size: 9,
          color: enabled ? CSS.textMuted : CSS.disabled,
        })
      );

      panel.add(
        createLabel(this, {
          x: option.x,
          y: 26,
          text: available > 0 ? `${available} in storage` : 'none in storage',
          size: 9,
          color: available > 0 ? CSS.current : CSS.disabled,
        })
      );
    }

    // Explains a disabled 2x that is only blocked by geometry, which is
    // otherwise indistinguishable from having none in storage.
    if (this.availableMounts('mount_double') > 0 && !this.canPlaceAt('mount_double', col, row)) {
      panel.add(
        createLabel(this, {
          y: height / 2 - 14,
          text: 'Mount 2x needs two free cells side by side',
          size: 9,
          color: CSS.danger,
        })
      );
    }
  }

  /** Popup for an installed mount: manage each bay, or remove the mount. */
  showMountPopup(mount) {
    const type = mount.getData('mountType');
    const def = MOUNT_TYPES[type];
    const row = mount.getData('gridRow');
    const panels = mount.getData('panels');

    const rowHeight = 30;
    const width = 280;
    const height = 96 + def.slots.length * rowHeight;
    const panel = this.openPopup({ title: def.label, width, height, row });

    if (def.powerBonus > 0) {
      panel.add(
        createLabel(this, {
          y: -height / 2 + 44,
          text: `+${Math.round(def.powerBonus * 100)}% output on this mount`,
          size: 9,
          color: CSS.current,
        })
      );
    }

    let y = -height / 2 + (def.powerBonus > 0 ? 66 : 52);

    def.slots.forEach((_slot, index) => {
      const filled = !!panels[index];
      const bayName = def.slots.length > 1 ? `Bay ${index + 1}` : 'Panel';

      panel.add(
        createLabel(this, {
          x: -width / 2 + 16,
          y,
          text: bayName,
          size: 10,
          color: filled ? CSS.watt : CSS.textMuted,
          origin: 0,
        })
      );

      panel.add(
        createLabel(this, {
          x: -width / 2 + 66,
          y,
          text: filled ? `${this.panelOutput(type).toFixed(2)} W/s` : 'empty',
          size: 9,
          color: filled ? CSS.current : CSS.disabled,
          origin: 0,
        })
      );

      if (filled) {
        panel.add(
          createButton(this, {
            x: width / 2 - 62,
            y,
            width: 96,
            height: 24,
            label: 'REMOVE',
            tone: 'danger',
            onClick: () => {
              this.detachPanel(mount, index);
              this.commit();
              this.showMountPopup(mount); // keep the popup open for more edits
            },
          })
        );
      } else {
        const canAdd = this.availablePanels() > 0;
        panel.add(
          createButton(this, {
            x: width / 2 - 62,
            y,
            width: 96,
            height: 24,
            label: canAdd ? 'ADD PANEL' : 'NO PANELS',
            tone: canAdd ? 'primary' : 'ghost',
            enabled: canAdd,
            onClick: () => {
              if (this.attachPanel(mount, index)) {
                this.commit();
                this.showMountPopup(mount);
              }
            },
          })
        );
      }

      y += rowHeight;
    });

    panel.add(
      createButton(this, {
        y: height / 2 - 20,
        width: 168,
        height: 24,
        label: 'REMOVE MOUNT',
        tone: 'ghost',
        onClick: () => {
          this.removeMount(mount);
          this.hidePopup();
        },
      })
    );
  }

  /* ══ MUTATIONS ══ */

  placeMount(type, col, row) {
    if (this.availableMounts(type) <= 0) {
      this.toasts.show(`No ${MOUNT_TYPES[type].label} in storage`, 'error');
      return;
    }

    if (!this.canPlaceAt(type, col, row)) {
      this.toasts.show(
        MOUNT_TYPES[type].cells > 1 ? 'Needs two free cells side by side' : 'Cell occupied',
        'error'
      );
      return;
    }

    const def = MOUNT_TYPES[type];
    this.createMount(type, col, row, []);

    const bonusNote = def.powerBonus > 0 ? ` · +${Math.round(def.powerBonus * 100)}% bonus` : '';
    this.toasts.show(`${def.label} installed${bonusNote}`, 'success');

    this.commit();
  }

  /**
   * Builds a mount container and its panels.
   *
   * Panels are children of this container rather than independent objects. That
   * is what guarantees a panel always renders above its own frame and is moved
   * and removed with it — previously both were separate objects on the same
   * cell competing for depth, so a panel could end up behind its mount.
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

    container.setSize(TILE * def.cells, TILE);
    container.setDepth(this.mountDepth(col, row));
    container.setInteractive({ useHandCursor: true });

    // Shadow first of all, so it sits under the frame and its panels. Being a
    // child of the container means it is positioned, moved and destroyed with
    // the mount automatically.
    container.add(
      createGroundShadow(this, {
        width: def.shadowWidth,
        y: SHADOW.y,
        offsetX: SHADOW.offsetX,
        alpha: SHADOW.alpha,
      })
    );

    // Frame next, so any panel added later sits above it.
    container.add(this.add.image(0, 0, def.texture));

    container.on('pointerdown', () => {
      if (!this.editMode) return;
      this.showMountPopup(container);
    });

    this.entityLayer.add(container);
    this.mounts.push(container);

    for (const cell of this.cellsFor(type, col, row)) {
      this.occupancy.set(this.cellKey(cell.col, cell.row), container);
    }

    def.slots.forEach((_slot, index) => {
      if (panelFlags[index]) this.attachPanel(container, index, { silent: true });
    });

    return container;
  }

  /**
   * @param {{ silent?: boolean }} options `silent` skips the storage check and
   *   the toast, used while restoring a saved layout.
   */
  attachPanel(mount, slotIndex, { silent = false } = {}) {
    const type = mount.getData('mountType');
    const slot = MOUNT_TYPES[type].slots[slotIndex];
    if (!slot) return false;

    const panels = mount.getData('panels');
    if (panels[slotIndex]) return false;

    if (!silent && this.availablePanels() <= 0) {
      this.toasts.show('No panels in storage', 'error');
      return false;
    }

    const sprite = this.add.image(slot.dx, slot.dy, 'solar_panel');
    mount.add(sprite);
    panels[slotIndex] = sprite;
    mount.setData('panels', panels);

    if (!silent) {
      this.toasts.show(`Panel installed · +${this.panelOutput(type).toFixed(2)} W/s`, 'success');
    }

    return true;
  }

  detachPanel(mount, slotIndex) {
    const panels = mount.getData('panels');
    const sprite = panels[slotIndex];
    if (!sprite) return false;

    sprite.destroy();
    panels[slotIndex] = null;
    mount.setData('panels', panels);

    this.toasts.show('Panel returned to storage', 'info');
    return true;
  }

  removeMount(mount) {
    const type = mount.getData('mountType');
    const def = MOUNT_TYPES[type];
    const col = mount.getData('gridCol');
    const row = mount.getData('gridRow');
    const panelCount = mount.getData('panels').filter(Boolean).length;

    for (const cell of this.cellsFor(type, col, row)) {
      this.occupancy.delete(this.cellKey(cell.col, cell.row));
    }
    this.mounts = this.mounts.filter((m) => m !== mount);

    // Destroying the container also destroys its panel children.
    mount.destroy();

    this.toasts.show(
      panelCount > 0
        ? `${def.label} and ${panelCount} panel${panelCount > 1 ? 's' : ''} returned to storage`
        : `${def.label} returned to storage`,
      'info'
    );

    this.commit();
  }

  /* ══ CABLING ══ */

  /** True when a mount carries at least one panel, i.e. is generating. */
  isPowered(mount) {
    return mount.getData('panels').some(Boolean);
  }

  /** Horizontal edge of a mount's footprint, where a cable attaches. */
  connectorX(mount, side) {
    const def = MOUNT_TYPES[mount.getData('mountType')];
    const halfWidth = def.shadowWidth / 2 - CABLE.connectorInset;
    return mount.x + (side === 'right' ? halfWidth : -halfWidth);
  }

  connectorY(mount) {
    return mount.y + CABLE.y;
  }

  /**
   * Redraws every cable from scratch.
   *
   * Rebuilding is cheap — a few dozen rectangles — and it removes a whole class
   * of bug: there is no incremental state to get out of step with the mounts
   * after a placement, removal, or a layout restore.
   */
  rebuildCables() {
    this.cableLayer.removeAll(true);
    this.pulses = [];

    // Wire each row independently: a run of cable across rows would have to
    // cross the field, which is not how a panel row is actually strung.
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const powered = this.mounts
        .filter((m) => m.getData('gridRow') === row && this.isPowered(m))
        .sort((a, b) => a.getData('gridCol') - b.getData('gridCol'));

      // A single generating mount has nothing to connect to.
      if (powered.length < 2) continue;

      /** Concatenated path across the whole row, for the pulse to travel. */
      const path = [];

      for (let i = 0; i < powered.length - 1; i += 1) {
        const from = powered[i];
        const to = powered[i + 1];

        const x1 = this.connectorX(from, 'right');
        const x2 = this.connectorX(to, 'left');

        // Adjacent mounts can leave almost no gap, in which case a cable would
        // be a single stray block — skip it and let the frames read as touching.
        if (x2 - x1 < CABLE.step) continue;

        const span = x2 - x1;
        const sag = Math.min(CABLE.maxSag, span * CABLE.sagRatio);

        const { objects, points } = createSaggingCable(this, {
          x1,
          y1: this.connectorY(from),
          x2,
          y2: this.connectorY(to),
          sag,
          step: CABLE.step,
          thickness: CABLE.thickness,
          color: CABLE.colour,
        });

        this.cableLayer.add(objects);
        path.push(...points);
      }

      if (path.length > 1) this.createPulse(path);
    }
  }

  /**
   * A bright block travelling the row's cable, suggesting current flow.
   *
   * Two rectangles: a dim halo and a bright core. That is as close to a glow as
   * the pixel style allows — an actual blur or particle would look foreign.
   */
  createPulse(path) {
    const start = path[0];

    const glow = this.add.rectangle(start.x, start.y, 6, 6, C.current, 0.22);
    const dot = this.add.rectangle(start.x, start.y, 3, 3, C.current, 0.95);

    this.cableLayer.add([glow, dot]);
    this.pulses.push({ path, dot, glow, index: 0 });
  }

  /** Advances every pulse one sample along its path, wrapping at the end. */
  advancePulses() {
    if (!this.pulses.length) return;

    for (const pulse of this.pulses) {
      pulse.index = (pulse.index + 1) % pulse.path.length;
      const point = pulse.path[pulse.index];
      pulse.dot.setPosition(point.x, point.y);
      pulse.glow.setPosition(point.x, point.y);
    }
  }

  /* ══ PERSISTENCE ══ */

  /**
   * Removes layouts left by the localStorage era.
   *
   * The server is now the only source of truth, so these keys are dead. They
   * are cleared rather than ignored because they contain another account's farm
   * on a shared browser.
   */
  discardLocalLayouts() {
    try {
      localStorage.removeItem('wattfarm_placement');

      const uid = getCurrentUserId();
      if (uid) localStorage.removeItem(`wattfarm:placement:${uid}`);
    } catch {
      // Storage unavailable — nothing to clean up.
    }
  }

  /** Serialises the scene into the shape the API expects. */
  layoutPayload() {
    return this.mounts.map((mount) => ({
      type: mount.getData('mountType'),
      col: mount.getData('gridCol'),
      row: mount.getData('gridRow'),
      panels: mount.getData('panels').map(Boolean),
    }));
  }

  /**
   * Schedules a save.
   *
   * Edits arrive in bursts — adding two panels to a double is two clicks a
   * second apart — so writes are coalesced instead of firing a request per
   * click. The server rate-limits this endpoint, and a full replace means the
   * last write wins, so debouncing is both cheaper and safe.
   */
  queueSave() {
    if (this.saveTimer) this.saveTimer.remove(false);
    this.saveTimer = this.time.delayedCall(500, () => this.flushSave());
  }

  async flushSave() {
    // Serialise saves: a reply that arrives after a newer edit would report a
    // stale power figure.
    if (this.saveInFlight) {
      this.savePending = true;
      return;
    }

    this.saveInFlight = true;
    this.savePending = false;

    const result = await saveLayout(this.layoutPayload());

    this.saveInFlight = false;

    if (result.ok) {
      this.serverPowerRate = result.powerRate;
      this.networkBaseline = result.networkBaseline;

      this.refreshToolbar();
    } else {
      /**
       * A rejected layout means the client and server disagree — usually the
       * inventory changed elsewhere. Reloading is the honest response: showing a
       * farm the server refuses to store would misreport income.
       */
      console.error('[game] layout rejected:', result.error, result.problems);
      this.toasts.show(result.problems?.[0] || result.error, 'error', { duration: 5000 });
      await this.loadLayoutFromServer({ silent: true });
    }

    if (this.savePending) this.queueSave();
  }

  /** Clears the scene of mounts, cables and pulses. */
  clearFarm() {
    for (const mount of this.mounts) mount.destroy();
    this.mounts = [];
    this.occupancy.clear();
    this.cableLayer.removeAll(true);
    this.pulses = [];
  }

  /**
   * Loads the authoritative layout and rebuilds the scene from it.
   *
   * @param {{ silent?: boolean }} [options] `silent` suppresses the failure
   *   toast, used when reloading after a rejected save already reported why.
   */
  async loadLayoutFromServer({ silent = false } = {}) {
    this.discardLocalLayouts();

    const data = await loadLayout();

    if (!data) {
      if (!silent) {
        this.toasts.show('Could not load your farm — check your connection', 'error', {
          duration: 6000,
        });
      }
      return;
    }

    this.clearFarm();

    this.serverPowerRate = data.powerRate;
    this.networkBaseline = data.networkBaseline;

    let skipped = 0;

    for (const entry of data.mounts) {
      if (!MOUNT_TYPES[entry?.type]) continue;

      const col = Number(entry.col);
      const row = Number(entry.row);
      if (!Number.isInteger(col) || !Number.isInteger(row)) continue;

      // The server validates placement, so this should always pass; it guards
      // against a client/server grid mismatch after a release.
      if (!this.canPlaceAt(entry.type, col, row)) {
        skipped += 1;
        continue;
      }

      this.createMount(entry.type, col, row, Array.isArray(entry.panels) ? entry.panels : []);
    }

    if (skipped > 0) {
      console.warn(`[game] ${skipped} stored mount(s) do not fit the current grid`);
    }

    this.emitPlacement();
    this.rebuildCables();
    this.refreshEditGrid();
    this.refreshToolbar();
  }

  /* ══ REACT SYNC ══ */

  commit() {
    this.emitPlacement();
    this.queueSave();
    this.rebuildCables();
    this.refreshEditGrid();
    this.refreshToolbar();
  }

  emitPlacement() {
    const single = this.countPlaced('mount_single');
    const double = this.countPlaced('mount_double');

    notifyPlacementChange({
      placedSolar: this.countPlacedPanels(),
      placedMount: single + double,
      // Reported per type as well: Storage subtracts placed from owned for each
      // asset type, which the combined total cannot answer.
      placedMountSingle: single,
      placedMountDouble: double,
      // Locally computed so the React panels update on the same frame as the
      // edit; the server's figure replaces it once the save returns.
      powerRate: this.totalPlacedOutput(),
      networkBaseline: this.networkBaseline,
    });
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

    // An open popup shows storage counts that have just changed.
    if (this.popup) this.hidePopup();
    this.refreshEditGrid();
    this.refreshToolbar();
  }
}
