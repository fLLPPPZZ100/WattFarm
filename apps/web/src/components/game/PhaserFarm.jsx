import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BootScene, FarmScene } from '../../game/scenes/index.js';

const W = 960;
const H = 640;

export default function PhaserFarm({ assets }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(function () {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      canvas,
      width: W,
      height: H,
      backgroundColor: '#0B1622',
      pixelArt: true,
      antialias: false,
      scene: [BootScene, FarmScene],
    });

    gameRef.current = game;

    game.events.once('ready', function () {
      const farm = game.scene.getScene('FarmScene');
      if (farm && farm.syncAssets) farm.syncAssets(assets);
    });

    return function () {
      gameRef.current = null;
      game.destroy(false, false);
    };
  }, []);

  // Sync asset updates
  useEffect(function () {
    const game = gameRef.current;
    if (!game) return;
    const farm = game.scene.getScene('FarmScene');
    if (farm && farm.syncAssets) farm.syncAssets(assets);
  }, [assets]);

  return (
    <div className="w-full rounded-xl overflow-hidden border border-line-dusk bg-bg-abyss flex items-center justify-center"
      style={{ aspectRatio: W + '/' + H, maxWidth: W + 'px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}