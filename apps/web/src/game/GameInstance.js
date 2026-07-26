import Phaser from 'phaser';
import { BootScene, FarmScene } from './scenes/index.js';

var game = null;
var onPlacementChange = null;

export function setPlacementCallback(fn) {
  onPlacementChange = fn;
}

export function notifyPlacementChange(solarPlaced, mountPlaced) {
  if (onPlacementChange) onPlacementChange(solarPlaced, mountPlaced);
}

export function boot() {
  if (game) return;
  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'phaser-root',
    width: 960,
    height: 640,
    backgroundColor: '#0B1622',
    pixelArt: true,
    antialias: false,
    scene: [BootScene, FarmScene],
  });
}

export function sync(assets, mountCount, solarCount) {
  if (!game) return;
  var farm = game.scene.getScene('FarmScene');
  if (farm) {
    if (farm.syncAssets) farm.syncAssets(assets, mountCount);
    if (farm.updateMountCount) farm.updateMountCount(mountCount);
    if (farm.updateSolarCount) farm.updateSolarCount(solarCount);
  }
}
