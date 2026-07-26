import { useEffect, useRef, memo } from 'react';
import { setup as setupGame } from '../../game/GameInstance.js';

/**
 * PhaserLayer — mounts the game canvas exactly ONCE.
 * NEVER re-renders. The game canvas is always present in the DOM.
 * Visibility is controlled by CSS z-index in the parent.
 */
const PhaserLayer = memo(function PhaserLayer() {
  const ref = useRef(null);
  const mounted = useRef(false);

  useEffect(function () {
    if (mounted.current) return;
    mounted.current = true;
    setupGame(ref.current);
  }, []);

  return <div ref={ref} className="w-full h-full" />;
});

export default PhaserLayer;