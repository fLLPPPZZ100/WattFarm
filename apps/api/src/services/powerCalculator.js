/**
 * Power output and reward distribution.
 *
 * ## Why this replaced accumulated watts
 *
 * The original model multiplied the *owned* panel quantity by the time since
 * `lastCollected`, producing an ever-growing "accumulated W". Two problems:
 * placement was irrelevant (owning paid the same as installing, so the farm was
 * decoration), and `lastCollected` was only written on purchase, so the value
 * grew without bound and buying an asset *reduced* a player's share.
 *
 * The genre model is a power *rate* competing for a block reward, not a
 * stockpile — RollerCoin pays on hashrate share. A rate needs no timestamps, so
 * nothing has to be reset and a layout change simply applies next cycle.
 */

import { MOUNT_TYPES, PANEL_BASE_W } from '../config/mounts.js';

/**
 * Instantaneous output of a set of placed mounts.
 *
 * @param {{ type: string, panels: boolean[] }[]} placedMounts
 * @returns {number} watts per second
 */
export function computePowerRate(placedMounts) {
  if (!Array.isArray(placedMounts)) return 0;

  let rate = 0;

  for (const mount of placedMounts) {
    const def = MOUNT_TYPES[mount.type];
    if (!def) continue;

    // Ignore flags beyond the mount's real bay count, so a stale row cannot
    // inflate output if a type's bay count ever shrinks.
    const panels = Array.isArray(mount.panels) ? mount.panels.slice(0, def.bays) : [];
    const filled = panels.filter(Boolean).length;

    rate += filled * PANEL_BASE_W * (1 + def.powerBonus);
  }

  return Math.round(rate * 10000) / 10000;
}

/**
 * Splits a fixed block reward between everyone mining it.
 *
 * Every player is measured against the *same* denominator: the synthetic
 * baseline plus the combined rate of all real players. That is what keeps the
 * budget conserved.
 *
 * An earlier version computed each player independently as
 * `rate / (rate + baseline)`, which quietly minted currency as the player base
 * grew — ten players at 40 W/s each were paid 25 VLT apiece, so a 50 VLT budget
 * paid out 250. With one player the two formulas agree exactly, so the bug was
 * invisible in testing.
 *
 * The baseline plays the part of network difficulty: it guarantees a single
 * player cannot take the whole budget, and gives diminishing returns as their
 * share of the network grows.
 *
 * @param {{ userId: string, rate: number }[]} miners
 * @param {number} baseline synthetic network power, W/s
 * @param {number} budget reward available this cycle
 * @returns {{ userId: string, rate: number, share: number }[]}
 */
export function computeNetworkShares(miners, baseline, budget) {
  const playerRate = miners.reduce((sum, miner) => sum + Math.max(0, miner.rate), 0);
  const total = Math.max(0, baseline) + playerRate;

  if (total <= 0) return miners.map((miner) => ({ ...miner, share: 0 }));

  return miners.map((miner) => ({
    ...miner,
    share: (Math.max(0, miner.rate) / total) * budget,
  }));
}

/**
 * One player's share, given the network total.
 *
 * Used for display, where the caller already knows the network total from
 * `networkPower.js` and does not need the whole miner list.
 *
 * @param {number} rate
 * @param {number} networkTotal baseline + every player's rate
 * @param {number} budget
 */
export function shareOf(rate, networkTotal, budget) {
  if (rate <= 0 || networkTotal <= 0) return 0;
  return (rate / networkTotal) * budget;
}

export default computePowerRate;
