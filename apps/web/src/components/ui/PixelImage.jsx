/**
 * Renders pixel art without destroying it.
 *
 * ## The problem this solves
 *
 * Sprites were being drawn at arbitrary CSS sizes: the 32x32 coin at 18x18, the
 * 32x32 avatar stretched into a 54x54 box. Neither is an integer ratio, so the
 * browser has to invent a mapping — some pixel rows survive, others vanish, and
 * the art looks broken rather than small.
 *
 * Two rules keep it crisp, and this component enforces both:
 *
 * 1. **Integer ratios only.** A sprite may be drawn at 1x, 2x, 3x… or at a
 *    clean 1/2, 1/4. Anything else is snapped to the nearest valid size.
 *
 * 2. **Nearest-neighbour only when enlarging.** For upscaling, `pixelated` is
 *    what keeps edges hard. For *downscaling* it is the worst choice, because it
 *    discards pixels instead of averaging them — a 1px outline can disappear
 *    along one edge and survive on another. Reduced images therefore use the
 *    browser's smooth filter, which behaves like a mipmap.
 *
 * ## The display-scaling caveat
 *
 * On Windows at 125% or 150% scaling, one CSS pixel is 1.25 or 1.5 device
 * pixels, so even an integer CSS size can land on fractional device pixels.
 * Sizes that are multiples of 8 survive both (16 x 1.25 = 20, 16 x 1.5 = 24),
 * which is another reason 18 was a bad number — it maps to 22.5 and 27.
 */

const DEV = import.meta.env.DEV;

/**
 * Sizes a sprite may legitimately be drawn at.
 *
 * Halving is allowed twice; beyond that too little of a small sprite survives to
 * be worth it, and a purpose-drawn asset is the right answer.
 *
 * @param {number} sourceSize natural pixel size of the asset
 * @returns {number[]} ascending list of valid sizes
 */
export function validPixelSizes(sourceSize) {
  const sizes = [];

  for (const divisor of [4, 2]) {
    const size = sourceSize / divisor;
    if (Number.isInteger(size) && size >= 8) sizes.push(size);
  }

  for (let multiple = 1; multiple <= 8; multiple += 1) {
    sizes.push(sourceSize * multiple);
  }

  return sizes;
}

/**
 * Nearest size that does not mangle the art.
 *
 * @param {number} sourceSize
 * @param {number} requested
 */
export function snapPixelSize(sourceSize, requested) {
  const options = validPixelSizes(sourceSize);

  return options.reduce((best, option) =>
    Math.abs(option - requested) < Math.abs(best - requested) ? option : best
  );
}

/**
 * @param {object} props
 * @param {string} props.src
 * @param {string} [props.alt] empty by default: sprites next to a text label are
 *   decorative, and repeating the label is noise for a screen reader.
 * @param {number} props.sourceSize natural size of the asset, in pixels
 * @param {number} props.size desired CSS size; snapped to a valid ratio
 * @param {number} [props.sourceHeight] for non-square art, its natural height
 * @param {boolean} [props.glow] adds the warm drop shadow used on currency
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
export default function PixelImage({
  src,
  alt = '',
  sourceSize,
  size,
  sourceHeight,
  glow = false,
  className = '',
  style = {},
  ...rest
}) {
  const width = snapPixelSize(sourceSize, size);
  const scale = width / sourceSize;

  // Non-square art keeps its aspect ratio by scaling both axes equally.
  const height = sourceHeight ? Math.round(sourceHeight * scale) : width;

  if (DEV && width !== size) {
    console.warn(
      `[PixelImage] ${size}px is a ${(size / sourceSize).toFixed(4)}x scale of a ` +
        `${sourceSize}px sprite, which does not land on whole pixels. ` +
        `Snapped to ${width}px (${scale}x). Valid sizes: ${validPixelSizes(sourceSize).join(', ')}.`
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{
        // Hard edges when enlarging; smooth averaging when reducing.
        imageRendering: scale >= 1 ? 'pixelated' : 'auto',
        // A blurred shadow under a 16px sprite muddies its silhouette, so the
        // glow is only offered where the sprite is drawn at 1x or larger.
        ...(glow && scale >= 1
          ? { filter: 'drop-shadow(0 0 6px rgba(242,184,75,0.45))' }
          : {}),
        ...style,
      }}
      {...rest}
    />
  );
}
