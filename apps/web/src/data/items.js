/**
 * Presentation metadata for shop and inventory items.
 *
 * Deliberately holds *only* things that cannot affect gameplay: label, blurb,
 * sprite, accent colour. Prices, production, bay counts and bonuses all come
 * from `/api/assets/catalog`.
 *
 * That split exists because the shop used to hardcode mount prices here. When
 * the double mount went from 25 to 45 VLT the page kept advertising 25 while the
 * server charged 45 — the player was billed a different number from the one they
 * clicked. Nothing in this file can cause that again.
 */

import solarPanelImg from '../assets/items/panel-1-animation.gif';
import mount1Img from '../assets/items/mounts/mount-1.png';
import mount2Img from '../assets/items/mounts/mount-2.png';

/** @typedef {'generator'|'support'} ItemCategory */

/**
 * `spriteWidth`/`spriteHeight` are the asset's natural pixel dimensions.
 *
 * They are recorded here so the UI can draw at an exact integer multiple. Left
 * to `object-contain` inside a fixed box, a 64px sprite was scaled by whatever
 * fraction happened to fit (1.875x in a 120px box), which smears the pixel grid.
 */
export const ITEM_META = {
  solar: {
    label: 'Solar Panel',
    category: 'generator',
    blurb: 'Generates watts while installed on a mount.',
    img: solarPanelImg,
    spriteWidth: 64,
    spriteHeight: 64,
    // 64 x 2 = 128, the same drawn width as the double mount at 1x, so cards
    // read consistently without any sprite being scaled fractionally.
    cardScale: 2,
    colour: '#F2B84B',
  },
  'panel-mount': {
    label: 'Single Mount',
    category: 'support',
    blurb: 'Holds one solar panel. Takes one grid cell.',
    img: mount1Img,
    spriteWidth: 64,
    spriteHeight: 64,
    cardScale: 2,
    colour: '#8B7355',
  },
  'panel-mount-double': {
    label: 'Double Mount',
    category: 'support',
    blurb: 'Holds two solar panels and boosts their output.',
    img: mount2Img,
    spriteWidth: 128,
    spriteHeight: 64,
    // Already 128 wide; 2x would be 256 and overflow the card.
    cardScale: 1,
    colour: '#8B7355',
  },
};

const FALLBACK = {
  label: null,
  category: 'generator',
  blurb: '',
  img: null,
  spriteWidth: 64,
  spriteHeight: 64,
  cardScale: 1,
  colour: '#2A3B4D',
};

/**
 * Metadata for a catalog type, falling back gracefully so a newly seeded asset
 * shows up in the shop with its server-provided numbers instead of vanishing.
 */
export function metaFor(type) {
  return ITEM_META[type] || { ...FALLBACK, label: type };
}

/** Groups catalog entries into the shop's categories. */
export function categoryOf(type) {
  return metaFor(type).category;
}

export default ITEM_META;
