#!/usr/bin/env node
/**
 * Checks the avatar catalogue against the server's authority lists.
 *
 * ## Why this exists
 *
 * The catalogue lives in the frontend (`apps/web/src/data/avatars.js`) but the
 * server decides what a player may equip (`FREE_AVATAR_IDS`) and what it costs
 * (`AVATAR_PRICES`). When those disagree the failure is silent until someone
 * clicks: the avatar renders normally and the PATCH comes back 403
 * "you have not unlocked this avatar yet".
 *
 * That is exactly what had happened. The catalogue offered four free avatars,
 * but `PATCH /me/avatar` only accepted ids already in `unlockedAvatars` — a
 * column that starts as `['default']` and only grows through the *paid* unlock
 * route. No free avatar could ever be selected.
 *
 * It also verifies that every image the catalogue imports exists on disk. The
 * original catalogue named seven PNGs, none of which were in the repository.
 *
 * Regex parsing rather than importing, because the catalogue imports PNGs and
 * Node cannot load those. In exchange this needs no dependencies and no build.
 *
 * Usage (from the repository root):
 *
 *   node apps/api/scripts/check-avatar-catalogue.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

const CATALOGUE_PATH = join(REPO_ROOT, 'apps/web/src/data/avatars.js');
const USERS_ROUTE_PATH = join(REPO_ROOT, 'apps/api/src/routes/users.js');
const CATALOGUE_DIR = dirname(CATALOGUE_PATH);

const catalogueSource = readFileSync(CATALOGUE_PATH, 'utf8');
const routeSource = readFileSync(USERS_ROUTE_PATH, 'utf8');

const problems = [];

/* ── Parse the frontend catalogue ────────────────────────────────── */

/** Maps the local import name of each image to its resolved path. */
const imageImports = new Map();
for (const match of catalogueSource.matchAll(
  /import\s+(\w+)\s+from\s+['"](\.\.?\/[^'"]+)['"]/g
)) {
  imageImports.set(match[1], resolve(CATALOGUE_DIR, match[2]));
}

/**
 * Entries look like:
 *   { id: 'default', label: 'Default', image: avatarDefaultImg, unlockType: 'free' }
 * with an optional `price`.
 */
const avatars = [];
for (const match of catalogueSource.matchAll(
  /\{\s*id:\s*'([^']+)',[\s\S]*?image:\s*(\w+),\s*unlockType:\s*'([^']+)',?\s*(?:price:\s*(\d+),?\s*)?\}/g
)) {
  avatars.push({
    id: match[1],
    image: match[2],
    unlockType: match[3],
    price: match[4] === undefined ? undefined : Number(match[4]),
  });
}

if (avatars.length === 0) {
  problems.push('parsed no avatars from the catalogue — has its shape changed?');
}

/* ── Parse the server's lists ────────────────────────────────────── */

const freeMatch = routeSource.match(/FREE_AVATAR_IDS\s*=\s*new Set\(\[([^\]]*)\]\)/);
if (!freeMatch) {
  problems.push('could not find FREE_AVATAR_IDS in routes/users.js');
}
const freeIds = new Set(
  freeMatch ? Array.from(freeMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]) : []
);

const pricesMatch = routeSource.match(/AVATAR_PRICES\s*=\s*\{([\s\S]*?)\n\};/);
if (!pricesMatch) {
  problems.push('could not find AVATAR_PRICES in routes/users.js');
}
const prices = new Map();
if (pricesMatch) {
  for (const entry of pricesMatch[1].matchAll(/'([^']+)':\s*(\d+)/g)) {
    prices.set(entry[1], Number(entry[2]));
  }
}

/* ── Invariants ──────────────────────────────────────────────────── */

// The column default for User.avatarId, and the sole default unlockedAvatars
// entry. Every existing account points at it, so it must stay equippable.
if (!avatars.some((avatar) => avatar.id === 'default')) {
  problems.push("the catalogue has no 'default' avatar, which every account row points at");
}
if (!freeIds.has('default')) {
  problems.push("'default' is missing from FREE_AVATAR_IDS");
}

const seenIds = new Set();
for (const avatar of avatars) {
  if (seenIds.has(avatar.id)) problems.push(`duplicate avatar id "${avatar.id}"`);
  seenIds.add(avatar.id);

  // An avatar offered by the client but unknown to the server is rejected on
  // click — the silent failure this script exists to catch.
  if (avatar.unlockType === 'free') {
    if (!freeIds.has(avatar.id)) {
      problems.push(
        `"${avatar.id}" is free in the catalogue but absent from FREE_AVATAR_IDS — ` +
          'selecting it would fail with 403'
      );
    }
    if (prices.has(avatar.id)) {
      problems.push(`"${avatar.id}" is free but also carries a server price`);
    }
  } else if (avatar.unlockType === 'vlt') {
    if (!prices.has(avatar.id)) {
      problems.push(
        `"${avatar.id}" costs VLT in the catalogue but is absent from AVATAR_PRICES — ` +
          'unlocking it would fail with 400'
      );
    } else if (avatar.price !== undefined && prices.get(avatar.id) !== avatar.price) {
      problems.push(
        `"${avatar.id}" price mismatch: catalogue shows ${avatar.price}, ` +
          `server charges ${prices.get(avatar.id)}`
      );
    }
    if (freeIds.has(avatar.id)) {
      problems.push(`"${avatar.id}" costs VLT but is also in FREE_AVATAR_IDS — it would be free`);
    }
    if (avatar.price === undefined) {
      problems.push(`"${avatar.id}" has unlockType 'vlt' but no price in the catalogue`);
    }
  } else {
    problems.push(`"${avatar.id}" has unknown unlockType "${avatar.unlockType}"`);
  }

  // A missing file renders as a broken image, which is how the previous
  // catalogue behaved for all seven of its entries.
  const imagePath = imageImports.get(avatar.image);
  if (!imagePath) {
    problems.push(`"${avatar.id}" references image \`${avatar.image}\` with no matching import`);
  } else if (!existsSync(imagePath)) {
    problems.push(`"${avatar.id}" image file does not exist: ${imagePath}`);
  }
}

// The reverse direction is a warning, not an error: an id the server permits but
// the client does not offer is unreachable, not broken.
const unreachable = [...freeIds].filter((id) => !seenIds.has(id));

/* ── Report ──────────────────────────────────────────────────────── */

console.log(
  `[avatars] ${avatars.length} catalogue entries, ` +
    `${freeIds.size} free id(s), ${prices.size} priced id(s)`
);

if (unreachable.length > 0) {
  console.log(`[avatars] note: allowed but not offered by the client: ${unreachable.join(', ')}`);
}

if (problems.length === 0) {
  console.log('[avatars] OK — catalogue and server lists agree, all images present');
} else {
  console.error(`\n[avatars] ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
}
