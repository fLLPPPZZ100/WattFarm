/**
 * The simulated mining network.
 *
 * `total` is the denominator every payout share is measured against: the
 * synthetic baseline plus the combined output of every real player. Exposing it
 * to the client matters because a player's income depends on their share of
 * this number, not on their own watts — showing only "12 W/s" tells them
 * nothing about what they will earn.
 */

import prisma from '../lib/prisma.js';
import env from '../config/env.js';
import { computePowerRate } from './powerCalculator.js';

/** Reward paid out per cycle, split by power share. */
export const BUDGET_PER_CYCLE = 50;

/**
 * Short-lived cache of the last computed network state.
 *
 * The dashboard and shop poll `/api/assets/mine` every few seconds, and each
 * call needs the network total. Without a cache every poll from every player
 * triggered a full scan of `PlacedMount`, which scales badly with both the
 * player count and the table size.
 *
 * The value only feeds display, and it changes slowly, so a few seconds of
 * staleness is invisible. The payout asks for a fresh read.
 */
let cache = null;

/** @type {number} default staleness tolerated by display callers, in ms. */
const DEFAULT_MAX_AGE_MS = 5000;

/** Drops the cache, so the next read recomputes. Used after a layout write. */
export function invalidateNetworkPower() {
  cache = null;
}

/**
 * Current state of the network.
 *
 * @param {object} [options]
 * @param {import('@prisma/client').Prisma.TransactionClient} [options.client]
 *   transaction client, to read inside a transaction. Bypasses the cache.
 * @param {number} [options.maxAgeMs] accepted cache age; 0 forces a fresh read.
 * @returns {Promise<{ baseline: number, playersRate: number, total: number,
 *   miners: { userId: string, rate: number }[] }>}
 */
export async function getNetworkPower({ client, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const usingTransaction = !!client;

  if (!usingTransaction && cache && Date.now() - cache.at <= maxAgeMs) {
    return cache.value;
  }

  const db = client || prisma;

  const rows = await db.placedMount.findMany({
    select: { userId: true, type: true, panels: true },
  });

  /** @type {Map<string, { type: string, panels: boolean[] }[]>} */
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId).push({ type: row.type, panels: row.panels });
  }

  const miners = [];
  let playersRate = 0;

  for (const [userId, mounts] of byUser) {
    const rate = computePowerRate(mounts);
    // Players with mounts but no panels produce nothing and would only add
    // noise to the payout loop.
    if (rate <= 0) continue;

    miners.push({ userId, rate });
    playersRate += rate;
  }

  const baseline = env.NETWORK_POWER_BASELINE;

  const value = {
    baseline,
    playersRate: Math.round(playersRate * 10000) / 10000,
    total: Math.round((baseline + playersRate) * 10000) / 10000,
    miners,
  };

  // Results read inside a transaction are not cached: they reflect uncommitted
  // state that other callers must not see.
  if (!usingTransaction) cache = { at: Date.now(), value };

  return value;
}

export default getNetworkPower;
