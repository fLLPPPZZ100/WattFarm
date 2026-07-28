/**
 * Pixel-art UI primitives for Phaser scenes.
 *
 * Mirrors the design language of the web UI (see components/ui/pixel.jsx and
 * index.css) so the in-game editor does not look like a different product:
 *
 *   - no rounded corners; 2px hard borders with a bevelled light/dark edge
 *   - hard offset shadows, never blurred
 *   - Silkscreen for labels, Pixelify Sans for prose, VT323 for numbers
 *   - stepped, short transitions — motion should feel digital, not springy
 *
 * Everything is built from rectangles and text, so there are no extra assets
 * and nothing to keep in sync with the CSS beyond the palette below.
 */

/** Shared palette, matching tailwind.config.js. */
export const C = {
  abyss: 0x0b1622,
  panel: 0x131f2e,
  line: 0x2a3b4d,
  watt: 0xf2b84b,
  current: 0x5fd4c4,
  textPrimary: 0xe8edf2,
  textMuted: 0x7c8ca0,
  bevelLight: 0x3d5570,
  bevelDark: 0x060d15,
  danger: 0xff5c5c,
};

/** Same values as CSS strings, for text styles. */
export const CSS = {
  watt: '#F2B84B',
  current: '#5FD4C4',
  textPrimary: '#E8EDF2',
  textMuted: '#7C8CA0',
  danger: '#FF5C5C',
  disabled: '#5A6675',
};

/**
 * The canvas font stack is intentionally its own thing.
 *
 * Phaser draws text straight to the canvas and inherits nothing from the CSS,
 * so these are named here rather than read from the type-system variables the
 * web UI uses. And they should stay pixel: this surface is the game world, the
 * one place the 8-bit character is the point, so it keeps Silkscreen / Pixelify
 * Sans / VT323 even though the surrounding interface has moved to Inter and
 * JetBrains Mono for readability.
 *
 * All three are loaded by the Google Fonts link in index.html; Silkscreen and
 * VT323 are loaded *for this canvas specifically* — the DOM UI no longer uses
 * them. Keep that link in step if these change.
 */
export const FONT_DISPLAY = '"Silkscreen", monospace';
export const FONT_BODY = '"Pixelify Sans", sans-serif';
export const FONT_MONO = '"VT323", monospace';

/**
 * Builds the layered rectangles that make a bevelled pixel surface.
 *
 * Returns objects positioned relative to (0,0) so they can be dropped straight
 * into a container. The shadow is returned separately because interactive
 * elements hide it while pressed.
 *
 * @param {Phaser.Scene} scene
 * @param {number} w
 * @param {number} h
 * @param {object} [options]
 * @param {number} [options.face] fill colour
 * @param {number} [options.light] top/left highlight
 * @param {number} [options.dark] bottom/right shade
 * @param {number} [options.shadowOffset] 0 disables the drop shadow
 */
export function bevelLayers(scene, w, h, options = {}) {
  const {
    face = C.panel,
    light = C.bevelLight,
    dark = C.bevelDark,
    shadowOffset = 4,
  } = options;

  const shadow =
    shadowOffset > 0
      ? scene.add.rectangle(shadowOffset, shadowOffset, w, h, C.bevelDark, 1)
      : null;

  const body = scene.add.rectangle(0, 0, w, h, face, 1);

  // 2px bevel edges. Drawn as thin rectangles rather than a stroke so the
  // light and dark sides can differ, which is what reads as "raised".
  const edges = [
    scene.add.rectangle(0, -h / 2 + 1, w, 2, light, 1), // top
    scene.add.rectangle(-w / 2 + 1, 0, 2, h, light, 1), // left
    scene.add.rectangle(0, h / 2 - 1, w, 2, dark, 1), // bottom
    scene.add.rectangle(w / 2 - 1, 0, 2, h, dark, 1), // right
  ];

  return { shadow, body, edges, all: [shadow, body, ...edges].filter(Boolean) };
}

/**
 * A stepped ground shadow.
 *
 * A blurred ellipse would clash with the pixel art, so this stacks three hard
 * 2px bands of decreasing width. At this scale the silhouette reads as an
 * ellipse while every edge stays on the pixel grid, and varying the alpha per
 * band fakes softness without any actual blur.
 *
 * The caller positions it: the sun in the background sits top-left, so shadows
 * are offset slightly right of the object's base.
 *
 * @param {Phaser.Scene} scene
 * @param {object} options
 * @param {number} options.width width of the widest band
 * @param {number} options.y vertical centre, in container coordinates
 * @param {number} [options.offsetX] horizontal shift, away from the light
 * @param {number} [options.alpha] opacity of the central band
 * @returns {Phaser.GameObjects.Rectangle[]} bands, back to front
 */
export function createGroundShadow(scene, { width, y, offsetX = 4, alpha = 0.26 }) {
  const narrow = Math.round(width * 0.6);

  return [
    scene.add.rectangle(offsetX, y - 2, narrow, 2, 0x000000, alpha * 0.6),
    scene.add.rectangle(offsetX, y, width, 2, 0x000000, alpha),
    scene.add.rectangle(offsetX, y + 2, narrow, 2, 0x000000, alpha * 0.6),
  ];
}

/**
 * A sagging cable drawn as stepped pixel blocks.
 *
 * A straight line between two mounts looks like a wire diagram; real cables
 * hang. The sag follows a parabola, `4t(1-t)`, sampled at whole-pixel steps so
 * every block lands on the grid — the same reason the ground shadow is banded
 * rather than blurred.
 *
 * Also returns the sampled points, which the caller uses to animate a pulse
 * travelling along the cable.
 *
 * @param {Phaser.Scene} scene
 * @param {object} options
 * @param {number} options.x1 start, in the same space as the returned objects
 * @param {number} options.y1
 * @param {number} options.x2 end
 * @param {number} options.y2
 * @param {number} [options.sag] peak droop in pixels
 * @param {number} [options.step] horizontal size of each block
 * @param {number} [options.thickness]
 * @param {number} [options.color]
 * @returns {{ objects: Phaser.GameObjects.Rectangle[], points: {x:number,y:number}[] }}
 */
export function createSaggingCable(
  scene,
  { x1, y1, x2, y2, sag = 8, step = 4, thickness = 2, color = 0x101c26 }
) {
  const objects = [];
  const points = [];

  const span = x2 - x1;
  const distance = Math.abs(span);
  const segments = Math.max(2, Math.round(distance / step));

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;

    const x = x1 + span * t;
    // Linear interpolation between the endpoints, plus the parabolic droop.
    const y = y1 + (y2 - y1) * t + sag * 4 * t * (1 - t);

    // Snapping keeps the cable crisp; without it the blocks land on
    // half-pixels and the line looks smeared.
    const px = Math.round(x);
    const py = Math.round(y);

    points.push({ x: px, y: py });

    // The last sample is the endpoint itself, already covered by the previous
    // block, so drawing it would overshoot the connector.
    if (i < segments) {
      objects.push(scene.add.rectangle(px, py, step + 1, thickness, color, 1));
    }
  }

  return { objects, points };
}

/**
 * A bevelled panel container.
 *
 * @returns {Phaser.GameObjects.Container} with `contentWidth` / `contentHeight`
 *   stored via setData for callers laying out children.
 */
export function createPanel(scene, { x, y, width, height, depth = 100, accent = true }) {
  const container = scene.add.container(x, y).setDepth(depth);

  const { all } = bevelLayers(scene, width, height, { face: C.panel, shadowOffset: 6 });
  container.add(all);

  if (accent) {
    // Matches the 2px accent bar at the top of the web panels.
    container.add(scene.add.rectangle(0, -height / 2 + 4, width - 4, 3, C.watt, 1));
  }

  container.setData('contentWidth', width);
  container.setData('contentHeight', height);
  return container;
}

/**
 * A pressable pixel button.
 *
 * The press effect moves the whole button down-right by the shadow offset and
 * hides the shadow, so it physically sinks into the surface.
 *
 * @returns {Phaser.GameObjects.Container}
 */
export function createButton(
  scene,
  {
    x = 0,
    y = 0,
    width,
    height = 26,
    label,
    tone = 'primary', // 'primary' | 'ghost' | 'danger'
    enabled = true,
    fontSize = 10,
    onClick,
    depth,
  }
) {
  const tones = {
    primary: { face: C.watt, text: '#0B1622', light: 0xf7d089, dark: 0xa97f24 },
    ghost: { face: C.abyss, text: CSS.watt, light: C.bevelLight, dark: C.bevelDark },
    danger: { face: 0x2a1a1a, text: CSS.danger, light: 0x5a3a3a, dark: C.bevelDark },
  };
  const palette = tones[tone] || tones.primary;

  const container = scene.add.container(x, y);
  if (depth !== undefined) container.setDepth(depth);

  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONT_DISPLAY,
      fontSize: `${fontSize}px`,
      color: enabled ? palette.text : CSS.disabled,
    })
    .setOrigin(0.5);

  const w = width || Math.ceil(text.width) + 22;
  const h = height;

  const { shadow, body, edges } = bevelLayers(scene, w, h, {
    face: enabled ? palette.face : C.line,
    light: enabled ? palette.light : C.line,
    dark: palette.dark,
    shadowOffset: 4,
  });

  container.add([shadow, body, ...edges, text]);
  container.setSize(w, h);

  if (!enabled) {
    container.setAlpha(0.55);
    return container;
  }

  container.setInteractive({ useHandCursor: true });

  let pressed = false;
  const lift = () => {
    if (!pressed) return;
    pressed = false;
    for (const obj of [body, ...edges, text]) {
      obj.x -= 4;
      obj.y -= 4;
    }
    shadow.setVisible(true);
  };

  container.on('pointerover', () => body.setFillStyle(palette.face, 0.85));
  container.on('pointerout', () => {
    body.setFillStyle(palette.face, 1);
    lift();
  });

  container.on('pointerdown', () => {
    if (pressed) return;
    pressed = true;
    for (const obj of [body, ...edges, text]) {
      obj.x += 4;
      obj.y += 4;
    }
    shadow.setVisible(false);
  });

  container.on('pointerup', () => {
    lift();
    onClick?.();
  });

  return container;
}

/** Section label with the accent colour, used for popup titles. */
export function createTitle(scene, { x = 0, y = 0, text, size = 11, color = CSS.watt }) {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT_DISPLAY,
      fontSize: `${size}px`,
      color,
    })
    .setOrigin(0.5);
}

/** Small body text. */
export function createLabel(
  scene,
  { x = 0, y = 0, text, size = 10, color = CSS.textMuted, origin = 0.5, font = FONT_BODY }
) {
  const label = scene.add.text(x, y, text, {
    fontFamily: font,
    fontSize: `${size}px`,
    color,
  });
  label.setOrigin(origin, 0.5);
  return label;
}

/** Thin divider matching the web panels. */
export function createDivider(scene, { y, width }) {
  return scene.add.rectangle(0, y, width, 1, C.line, 0.5);
}

/**
 * Toast notifications.
 *
 * Stacks upward from a baseline so several messages can be visible at once —
 * removing a mount with two panels reports both facts, and burying one behind
 * the other would lose information.
 *
 * The previous implementation was a single floating text that any new message
 * replaced mid-animation.
 */
export function createToastManager(scene, { x, baselineY, depth = 900, maxVisible = 4 }) {
  /** @type {Phaser.GameObjects.Container[]} newest last */
  let active = [];

  const TONES = {
    success: { border: C.current, text: CSS.current, icon: '+' },
    info: { border: C.line, text: CSS.textPrimary, icon: '*' },
    error: { border: C.danger, text: CSS.danger, icon: '!' },
  };

  const SPACING = 34;

  /** Re-stacks the visible toasts so the newest sits on the baseline. */
  function reflow() {
    active.forEach((toast, index) => {
      const targetY = baselineY - (active.length - 1 - index) * SPACING;
      scene.tweens.add({
        targets: toast,
        y: targetY,
        duration: 120,
        ease: 'Quad.easeOut',
      });
    });
  }

  function dismiss(toast) {
    if (!active.includes(toast)) return;
    active = active.filter((t) => t !== toast);

    scene.tweens.add({
      targets: toast,
      alpha: 0,
      y: toast.y - 14,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => toast.destroy(),
    });

    reflow();
  }

  function show(message, tone = 'info', { duration = 2400 } = {}) {
    const palette = TONES[tone] || TONES.info;

    const container = scene.add.container(x, baselineY).setDepth(depth);

    const icon = scene.add
      .text(0, 0, palette.icon, {
        fontFamily: FONT_DISPLAY,
        fontSize: '11px',
        color: palette.text,
      })
      .setOrigin(0.5);

    const text = scene.add
      .text(0, 0, message, {
        fontFamily: FONT_BODY,
        fontSize: '11px',
        color: palette.text,
      })
      .setOrigin(0, 0.5);

    const paddingX = 12;
    const gap = 8;
    const width = paddingX * 2 + 12 + gap + Math.ceil(text.width);
    const height = 28;

    const { all, body } = bevelLayers(scene, width, height, {
      face: C.panel,
      light: palette.border,
      dark: C.bevelDark,
      shadowOffset: 3,
    });
    body.setAlpha(0.97);

    icon.setPosition(-width / 2 + paddingX + 6, 0);
    text.setPosition(-width / 2 + paddingX + 12 + gap, 0);

    container.add([...all, icon, text]);

    // Enter from slightly below with a short stepped move, matching the
    // `animate-pixel-in` feel of the web UI.
    container.setAlpha(0);
    container.y = baselineY + 10;
    scene.tweens.add({
      targets: container,
      alpha: 1,
      y: baselineY,
      duration: 160,
      ease: 'Quad.easeOut',
    });

    active.push(container);

    // Oldest first when over capacity, so the newest message is always visible.
    while (active.length > maxVisible) dismiss(active[0]);

    reflow();

    scene.time.delayedCall(duration, () => dismiss(container));
    return container;
  }

  function clear() {
    for (const toast of active) toast.destroy();
    active = [];
  }

  return { show, clear };
}
