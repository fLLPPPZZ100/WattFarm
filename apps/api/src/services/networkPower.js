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
 * Current state of the network.
 *
 * Reads every placed mount to sum player output. That is one query over a small
 * table today; if the player base grows this should become a maintained
 * aggregate rather than a full scan.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} [client] use a
 *   transaction client to read the network inside a payout transaction.
 * @returns {Promise<{ baseline: number, playersRate: number, total: number,
 *   miners: { userId: string, rate: number }[] }>}
 */
export async function getNetworkPower(client = prisma) {
  const rows = await client.placedMount.findMany({
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

  return {
    baseline,
    playersRate: Math.round(playersRate * 10000) / 10000,
    total: Math.round((baseline + playersRate) * 10000) / 10000,
    miners,
  };
}

export default getNetworkPower;
