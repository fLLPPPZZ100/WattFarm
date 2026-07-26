import Phaser from 'phaser';
import bgGameImg from '../../assets/backgrounds/background-game.png';
import solarPanelImg from '../../assets/items/panel-1.png';
import mountSingleImg from '../../assets/items/mounts/mount-1.png';
import mountDoubleImg from '../../assets/items/mounts/mount-2.png';

/**
 * BootScene — loads all game assets, then starts FarmScene.
 * Runs once when the game is created.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Background
    this.load.image('bg_game', bgGameImg);

    // Entity sprites
    this.load.image('solar_panel', solarPanelImg);
    this.load.image('mount_single', mountSingleImg);
    this.load.image('mount_double', mountDoubleImg);
  }

  create() {
    // Generate placeholder textures in create() (texture manager is fully ready)
    this.createPlaceholderTexture('wind_turbine', '#5FD4C4');
    this.createPlaceholderTexture('hydro_plant', '#4DA8DA');
    this.createPlaceholderTexture('battery', '#888888');
    this.scene.start('FarmScene');
  }

  /**
   * Generates a 32x32 placeholder texture using the texture manager.
   */
  createPlaceholderTexture(key, hexColor) {
    if (this.textures.exists(key)) return;

    var canvas = this.textures.createCanvas(key, 32, 32);
    var ctx = canvas.getContext();
    var color = Phaser.Display.Color.HexStringToColor(hexColor);

    // Fill
    ctx.fillStyle = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.3)';
    ctx.fillRect(0, 0, 32, 32);

    // Border
    ctx.strokeStyle = 'rgba(' + color.red + ',' + color.green + ',' + color.blue + ',0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 32, 32);

    canvas.refresh();
  }
}