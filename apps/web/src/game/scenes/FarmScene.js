import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { notifyPlacementChange } from '../GameInstance.js';

const TILE = 96;
const GRID_OFFSET_X = 96;
const GRID_OFFSET_Y = 24;
const TOOLBAR_H = 40;
const GRID_COLS = 8;
const GRID_ROWS_START = 2; // skip sky rows
const GRID_ROWS_END = 5;

export default class FarmScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FarmScene' });
    this.entities = [];
    this.editMode = false;
    this.editGrid = [];
    this.editAddButtons = [];
    this.placedCount = { solar: 0, mount_single: 0, mount_double: 0 };
    this.mountsOwned = 0;
    this.doubleMountsOwned = 0;
    this.solarsOwned = 0;
    this.popupContainer = null;
  }

  create() {
    // Background
    const bgImg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_game');
    bgImg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.entityLayer = this.add.container(0, 0).setDepth(10);

    // Edit mode toggle button (bottom bar)
    this.createEditButton();

    // Restore saved placement
    this.restorePlacement();

    this.game.events.emit('ready');
  }

  /* ── EDIT MODE TOGGLE BUTTON ── */
  createEditButton() {
    const y = GAME_HEIGHT - TOOLBAR_H / 2;
    const bg = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, TOOLBAR_H, 0x131f2e, 0.9)
      .setDepth(80).setStrokeStyle(1, 0x2A3B4D);

    const self = this;
    this.editBtn = this.add.text(GAME_WIDTH / 2, y, 'EDIT', {
      fontFamily: '"Silkscreen", cursive', fontSize: '13px', color: '#F2B84B',
      backgroundColor: '#1A1A2A', padding: { x: 16, y: 6 },
    }).setOrigin(0.5).setDepth(81).setInteractive({ useHandCursor: true });

    this.editBtn.on('pointerover', function () { self.editBtn.setColor('#FFFFFF'); });
    this.editBtn.on('pointerout', function () {
      self.editBtn.setColor(self.editMode ? '#5FD4C4' : '#F2B84B');
    });
    this.editBtn.on('pointerdown', function () { self.toggleEditMode(); });
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

  /* ── EDIT GRID ── */
  showEditGrid() {
    this.hideEditGrid();
    const self = this;

    for (let r = GRID_ROWS_START; r <= GRID_ROWS_END; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cx = GRID_OFFSET_X + c * TILE + TILE / 2;
        const cy = GRID_OFFSET_Y + r * TILE + TILE / 2;

        // Grid cell outline — subtle, thin lines
        const cell = this.add.rectangle(cx, cy, TILE, TILE, 0x0b1622, 0.25)
          .setDepth(5).setStrokeStyle(0.5, 0x2A3B4D, 0.15);
        this.editGrid.push(cell);

        // Only mount entities determine occupation
        const occupied = this.entities.some(function (e) {
          const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
          const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
          return ec === c && er === r && (e.getData('entityType') === 'mount_single' || e.getData('entityType') === 'mount_double');
        });

        if (!occupied) {
          // ADD button — pixel-art styled
          const addBtn = this.add.text(cx, cy, 'ADD', {
            fontFamily: '"Silkscreen", cursive', fontSize: '10px', color: '#F2B84B',
            backgroundColor: 'rgba(19, 31, 46, 0.85)', padding: { x: 10, y: 6 },
          }).setOrigin(0.5).setDepth(6).setInteractive({ useHandCursor: true });

          addBtn.on('pointerover', function () { addBtn.setColor('#FFFFFF'); addBtn.setBackgroundColor('rgba(42, 42, 58, 0.9)'); });
          addBtn.on('pointerout', function () { addBtn.setColor('#F2B84B'); addBtn.setBackgroundColor('rgba(19, 31, 46, 0.85)'); });
          addBtn.on('pointerdown', (function (col, row) {
            return function () { self.showAddPopup(col, row); };
          })(c, r));

          this.editAddButtons.push(addBtn);
        }
      }
    }
  }

  hideEditGrid() {
    for (const g of this.editGrid) g.destroy();
    for (const b of this.editAddButtons) b.destroy();
    this.editGrid = [];
    this.editAddButtons = [];
  }

  /* ── ADD POPUP (in edit mode on empty cell) ── */
  showAddPopup(col, row) {
    this.hidePopup();
    const x = GRID_OFFSET_X + col * TILE + TILE / 2;
    const y = GRID_OFFSET_Y + row * TILE + TILE / 2;
    const popY = Math.max(60, y - 60);
    const self = this;

    const singleAvail = this.mountsOwned - (this.placedCount['mount_single'] || 0);
    const doubleAvail = this.doubleMountsOwned - (this.placedCount['mount_double'] || 0);

    const W = 260;
    const H = 100;
    const menu = this.add.container(GAME_WIDTH / 2, popY).setDepth(200);
    const bg = this.add.rectangle(0, 0, W, H, 0x131f2e, 0.95).setStrokeStyle(1, 0x8B7355);
    bg.setInteractive(); bg.on('pointerdown', function () {});
    menu.add(bg);

    // Title
    const title = this.add.text(0, -H / 2 + 18, 'Place Mount', {
      fontFamily: '"Silkscreen", cursive', fontSize: '14px', color: '#F2B84B',
    }).setOrigin(0.5);
    menu.add(title);

    // Divider
    menu.add(this.add.rectangle(0, -H / 2 + 36, W - 20, 1, 0x8B7355, 0.3));

    // Single mount button
    const singleLabel = '🔩 Mount 1x  (' + singleAvail + ')';
    const sBtn = this.add.text(-W / 4, 10, singleLabel, {
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      color: singleAvail > 0 ? '#F2B84B' : '#7C8CA0',
      backgroundColor: '#1A1A2A', padding: { x: 12, y: 6 },
    }).setOrigin(0.5);
    sBtn.setInteractive({ useHandCursor: singleAvail > 0 });
    if (singleAvail > 0) {
      sBtn.on('pointerover', function () { sBtn.setColor('#FFFFFF'); sBtn.setBackgroundColor('#2A2A3A'); });
      sBtn.on('pointerout', function () { sBtn.setColor('#F2B84B'); sBtn.setBackgroundColor('#1A1A2A'); });
      sBtn.on('pointerdown', function () { self.placeMountOn(col, row, 'single'); self.hidePopup(); });
    }
    menu.add(sBtn);

    // Double mount button
    const doubleLabel = '🔩 Mount 2x  (' + doubleAvail + ')';
    const dBtn = this.add.text(W / 4, 10, doubleLabel, {
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      color: doubleAvail > 0 ? '#F2B84B' : '#7C8CA0',
      backgroundColor: '#1A1A2A', padding: { x: 12, y: 6 },
    }).setOrigin(0.5);
    dBtn.setInteractive({ useHandCursor: doubleAvail > 0 });
    if (doubleAvail > 0) {
      dBtn.on('pointerover', function () { dBtn.setColor('#FFFFFF'); dBtn.setBackgroundColor('#2A2A3A'); });
      dBtn.on('pointerout', function () { dBtn.setColor('#F2B84B'); dBtn.setBackgroundColor('#1A1A2A'); });
      dBtn.on('pointerdown', function () { self.placeMountOn(col, row, 'double'); self.hidePopup(); });
    }
    menu.add(dBtn);

    // Close
    const close = this.add.text(W / 2 - 16, -H / 2 + 14, '✕', {
      fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#7C8CA0',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerover', function () { close.setColor('#E8EDF2'); });
    close.on('pointerout', function () { close.setColor('#7C8CA0'); });
    close.on('pointerdown', function () { self.hidePopup(); });
    menu.add(close);

    this.popupContainer = menu;
  }

  /* ── CLICK ON OCCUPIED CELL (edit mode) ── */
  showEditPopup(col, row) {
    this.hidePopup();
    const cx = GRID_OFFSET_X + col * TILE + TILE / 2;
    const cy = GRID_OFFSET_Y + row * TILE + TILE / 2;
    const popY = Math.max(60, cy - 80);
    const self = this;

    // Find what's on this cell
    const mountEnt = this.entities.find(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row && (e.getData('entityType') === 'mount_single' || e.getData('entityType') === 'mount_double');
    });
    const panelEnt = this.entities.find(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row && e.getData('entityType') === 'solar';
    });
    const mountType = mountEnt ? mountEnt.getData('entityType') : null;
    const hasPanel = !!panelEnt;
    const panelAvail = this.solarsOwned - (this.placedCount['solar'] || 0);
    const isDouble = mountType === 'mount_double';

    const W = 260;
    const H = hasPanel ? 130 : 140;
    const menu = this.add.container(GAME_WIDTH / 2, popY).setDepth(200);
    const bg = this.add.rectangle(0, 0, W, H, 0x131f2e, 0.95).setStrokeStyle(1, 0x8B7355);
    bg.setInteractive(); bg.on('pointerdown', function () {});
    menu.add(bg);

    const title = this.add.text(0, -H / 2 + 18, isDouble ? 'Double Mount' : 'Mount', {
      fontFamily: '"Silkscreen", cursive', fontSize: '14px', color: '#F2B84B',
    }).setOrigin(0.5);
    menu.add(title);
    menu.add(this.add.rectangle(0, -H / 2 + 36, W - 20, 1, 0x8B7355, 0.3));

    let yOff = -H / 2 + 52;

    if (hasPanel) {
      menu.add(this.add.text(0, yOff, '☀ Solar Panel', {
        fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#F2B84B',
      }).setOrigin(0.5));
      yOff += 20;

      const rmBtn = this.add.text(0, yOff, '🗑 Remove Panel', {
        fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#E8EDF2',
        backgroundColor: '#2A1A1A', padding: { x: 12, y: 5 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      rmBtn.on('pointerover', function () { rmBtn.setColor('#FF6B6B'); });
      rmBtn.on('pointerout', function () { rmBtn.setColor('#E8EDF2'); });
      rmBtn.on('pointerdown', function () { self.removePanel(col, row); self.hidePopup(); });
      menu.add(rmBtn);
      yOff += 24;
    } else {
      const canPlace = panelAvail > 0;
      const addBtn = this.add.text(0, yOff, '☀ Add Solar Panel (' + Math.max(0, panelAvail) + ' available)', {
        fontFamily: 'Inter, sans-serif', fontSize: '12px',
        color: canPlace ? '#F2B84B' : '#7C8CA0',
        backgroundColor: canPlace ? '#2A2510' : '#1A1A1A', padding: { x: 12, y: 5 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: canPlace });
      if (canPlace) {
        addBtn.on('pointerover', function () { addBtn.setColor('#FFFFFF'); });
        addBtn.on('pointerout', function () { addBtn.setColor('#F2B84B'); });
        addBtn.on('pointerdown', function () { self.placePanelOn(col, row); self.hidePopup(); });
      }
      menu.add(addBtn);
      yOff += 24;
    }

    // Unmount
    const unmountBtn = this.add.text(0, yOff, '📦 Remove Mount', {
      fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#F2B84B',
      backgroundColor: '#1A1A2A', padding: { x: 12, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    unmountBtn.on('pointerover', function () { unmountBtn.setColor('#FFFFFF'); });
    unmountBtn.on('pointerout', function () { unmountBtn.setColor('#F2B84B'); });
    unmountBtn.on('pointerdown', function () { self.unmountAt(col, row); self.hidePopup(); });
    menu.add(unmountBtn);

    // Close
    const close = this.add.text(W / 2 - 16, -H / 2 + 14, '✕', {
      fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#7C8CA0',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerover', function () { close.setColor('#E8EDF2'); });
    close.on('pointerout', function () { close.setColor('#7C8CA0'); });
    close.on('pointerdown', function () { self.hidePopup(); });
    menu.add(close);

    this.popupContainer = menu;
  }

  /* ── PLACEMENT ── */
  placeMountOn(col, row, mountType) {
    const countKey = mountType === 'double' ? 'mount_double' : 'mount_single';
    const owned = mountType === 'double' ? this.doubleMountsOwned : this.mountsOwned;
    const placed = this.placedCount[countKey] || 0;
    if (owned - placed <= 0) { this.showFlash('No mounts available'); return; }

    const x = GRID_OFFSET_X + col * TILE + TILE / 2;
    const y = GRID_OFFSET_Y + row * TILE + TILE / 2;

    // Check cell already occupied
    if (this.entities.some(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row && (e.getData('entityType') === 'mount_single' || e.getData('entityType') === 'mount_double');
    })) { this.showFlash('Cell occupied'); return; }

    const ent = this.createEntity(x, y, { type: countKey, id: countKey + '_' + Date.now() });
    if (ent) {
      this.entities.push(ent);
      this.placedCount[countKey] = (this.placedCount[countKey] || 0) + 1;
      this.emitPlacement();
      if (this.editMode) { this.hideEditGrid(); this.showEditGrid(); }
    }
  }

  placePanelOn(col, row) {
    const avail = this.solarsOwned - (this.placedCount['solar'] || 0);
    if (avail <= 0) { this.showFlash('No panels available'); return; }

    const x = GRID_OFFSET_X + col * TILE + TILE / 2;
    const y = GRID_OFFSET_Y + row * TILE + TILE / 2;

    if (this.entities.some(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row && e.getData('entityType') === 'solar';
    })) { this.showFlash('Panel already here'); return; }

    const ent = this.createEntity(x, y, { type: 'solar', id: 'solar_' + Date.now() });
    if (ent) {
      this.entities.push(ent);
      this.placedCount['solar'] = (this.placedCount['solar'] || 0) + 1;
      this.emitPlacement();
    }
  }

  removePanel(col, row) {
    const panel = this.entities.find(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row && e.getData('entityType') === 'solar';
    });
    if (panel) {
      this.placedCount['solar'] = Math.max(0, (this.placedCount['solar'] || 1) - 1);
      panel.destroy();
      this.entities = this.entities.filter(function (e) { return e !== panel; });
      this.showFlash('Panel removed');
      this.emitPlacement();
      if (this.editMode) { this.hideEditGrid(); this.showEditGrid(); }
    }
  }

  unmountAt(col, row) {
    const toRemove = this.entities.filter(function (e) {
      const ec = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const er = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return ec === col && er === row;
    });
    if (toRemove.length === 0) return;

    for (const ent of toRemove) {
      const t = ent.getData('entityType');
      this.placedCount[t] = Math.max(0, (this.placedCount[t] || 1) - 1);
      ent.destroy();
    }
    this.entities = this.entities.filter(function (e) { return toRemove.indexOf(e) === -1; });
    this.showFlash('Returned to storage');
    this.emitPlacement();
    if (this.editMode) { this.hideEditGrid(); this.showEditGrid(); }
  }

  /* ── FLASH ── */
  showFlash(text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - TOOLBAR_H - 30, text, {
      fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#F2B84B',
      backgroundColor: '#131f2e', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setDepth(99);
    this.tweens.add({ targets: msg, alpha: 0, y: msg.y - 30, duration: 2000, ease: 'Power2', onComplete: function () { msg.destroy(); } });
  }

  hidePopup() { if (this.popupContainer) { this.popupContainer.destroy(); this.popupContainer = null; } }

  /* ── ENTITY ── */
  createEntity(x, y, data) {
    const texMap = { solar: 'solar_panel', mount: 'mount_single', mount_single: 'mount_single', mount_double: 'mount_double' };
    const tex = texMap[data.type];
    if (!tex) return null;

    // Depth sorting: rightmost columns render on top (higher depth = higher col)
    const col = Math.floor((x - GRID_OFFSET_X) / TILE);
    const row = Math.floor((y - GRID_OFFSET_Y) / TILE);
    const depth = 10 + col + row * 0.01; // col is primary axis, row breaks ties

    const c = this.add.container(x, y);
    c.setData('entityType', data.type);
    c.setData('entityId', data.id);
    c.setData('gridCol', col);
    c.setData('gridRow', row);
    c.setSize(TILE, TILE);
    c.setDepth(depth);
    c.setInteractive({ draggable: false, useHandCursor: true });

    // Display: use original texture size — no forced scaling
    const sp = this.add.image(0, 0, tex);
    c.add(sp);

    const self = this;
    c.on('pointerdown', function () {
      if (!self.editMode) return;
      const col = Math.floor((x - GRID_OFFSET_X) / TILE);
      const row = Math.floor((y - GRID_OFFSET_Y) / TILE);
      self.showEditPopup(col, row);
    });

    this.entityLayer.add(c);
    return c;
  }

  /* ── SAVE / RESTORE ── */
  savePlacement() {
    const data = this.entities.map(function (e) {
      const col = Math.floor((e.x - GRID_OFFSET_X) / TILE);
      const row = Math.floor((e.y - GRID_OFFSET_Y) / TILE);
      return { type: e.getData('entityType'), col: col, row: row };
    });
    try { localStorage.setItem('wattfarm_placement', JSON.stringify(data)); } catch (e) {}
  }

  restorePlacement() {
    let data;
    try { data = JSON.parse(localStorage.getItem('wattfarm_placement')); } catch (e) {}
    if (!data || !Array.isArray(data)) return;

    const self = this;
    data.forEach(function (item) {
      const x = GRID_OFFSET_X + item.col * TILE + TILE / 2;
      const y = GRID_OFFSET_Y + item.row * TILE + TILE / 2;
      const ent = self.createEntity(x, y, { type: item.type, id: item.type + '_' + Date.now() + Math.random() });
      if (ent) {
        self.entities.push(ent);
        self.placedCount[item.type] = (self.placedCount[item.type] || 0) + 1;
      }
    });
    this.emitPlacement();
  }

  /* ── SYNC ── */
  emitPlacement() {
    const totalMounts = (this.placedCount['mount_single'] || 0) + (this.placedCount['mount_double'] || 0);
    notifyPlacementChange(this.placedCount['solar'] || 0, totalMounts);
    this.savePlacement();
  }
  updateMountCount(mc) { this.mountsOwned = typeof mc === 'number' ? mc : (this.mountsOwned || 0); }
  updateSolarCount(sc) { this.solarsOwned = typeof sc === 'number' ? sc : (this.solarsOwned || 0); }
  syncAssets(assetList, mountCount) {
    this.mountsOwned = typeof mountCount === 'number' ? mountCount : 0;
    var dm = 0;
    if (assetList) {
      var sa = assetList.find(function (a) { return a.type === 'solar'; }); if (sa) this.solarsOwned = sa.quantity;
      var dmAsset = assetList.find(function (a) { return a.type === 'panel-mount-double'; });
      if (dmAsset) dm = dmAsset.quantity;
    }
    this.doubleMountsOwned = dm;
  }
}