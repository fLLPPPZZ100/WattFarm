import Phaser from 'phaser';
import { GAME_WIDTH } from '../config.js';

/**
 * UIScene — overlay HUD running parallel to FarmScene.
 *
 * Displays:
 *  - Accumulated W (top-left)
 *  - VLT Balance (top-right)
 * Data is pushed from React via syncUI().
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene', active: false });
    this.wText = null;
    this.vltText = null;
  }

  create() {
    // Semi-transparent top bar background
    const barHeight = 44;
    const bar = this.add.rectangle(GAME_WIDTH / 2, barHeight / 2, GAME_WIDTH, barHeight, 0x131f2e, 0.85);
    bar.setDepth(90);

    // W label
    this.add
      .text(12, 8, 'W', {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: '#7C8CA0',
      })
      .setDepth(91);

    // W value (mono font for tabular numbers)
    this.wText = this.add
      .text(12, 20, '0.0', {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '16px',
        color: '#5FD4C4',
      })
      .setDepth(91);

    // VLT value (right-aligned)
    this.vltText = this.add
      .text(GAME_WIDTH - 12, 14, '0.0 VLT', {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '14px',
        color: '#F2B84B',
      })
      .setOrigin(1, 0)
      .setDepth(91);

    // VLT coin icon
    if (this.textures.exists('vlt_coin')) {
      const coin = this.add.image(GAME_WIDTH - 12 - this.vltText.width - 20, 22, 'vlt_coin');
      coin.setDisplaySize(16, 16);
      coin.setDepth(91);
    }
  }

  /**
   * Called by React to update HUD values.
   * @param {number} totalW
   * @param {number} vltBalance
   */
  syncUI(totalW, vltBalance) {
    if (this.wText) {
      this.wText.setText(totalW.toFixed(1));
    }
    if (this.vltText) {
      this.vltText.setText(vltBalance.toFixed(1) + ' VLT');
    }
  }
}