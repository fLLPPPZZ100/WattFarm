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
    /**
     * This used to generate placeholder canvas textures for `wind_turbine`,
     * `hydro_plant` and `battery`. No scene ever drew any of them: wind and hydro
     * do not exist, and batteries were never built. The generator went with them.
     */
    this.scene.start('FarmScene');
  }
}