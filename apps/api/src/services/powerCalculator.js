/**
 * Power output from a farm layout.
 *
 * ## Why this replaces accumulated watts
 *
 * The old model multiplied the *owned* panel quantity by the time since
 * `lastCollected`, producing an ever-growing "accumulated W" that was then
 * split proportionally. Two problems:
 *
 *   1. Placement was irrelevant — owning panels paid the same as installing
 *      them, so the farm was decoration.
 *   2. `lastCollected` was only written on purchase, so the accumulated value
 *      grew without bound and whoever had bought longest ago dominated the
 *      split. Buying a new asset *reduced* a player's share by resetting it.
 *
 * The genre model is a power *rate* competing for a block reward, not a
 * stockpile: RollerCoin pays out on hashrate share. Rate is also far simpler —
 * no timestamps, nothing to reset, and a layout change takes effect at the next
 * payout without any integration over time.
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

    // Ignore any stored flags beyond the mount's real bay count, so a stale row
    // cannot inflate output if a type's bay count ever shrinks.
    const panels = Array.isArray(mount.panels) ? mount.panels.slice(0, def.bays) : [];
    const filled = panels.filter(Boolean).length;

    rate += filled * PANEL_BASE_W * (1 + def.powerBonus);
  }

  return Math.round(rate * 10000) / 10000;
}

/**
 * A player's share of a fixed block reward.
 *
 * With a single player and a plain proportional split, `myRate / totalRate` is
 * always 1, so the whole budget was paid out no matter how much was built —
 * exactly what made buying panels feel pointless. Adding a synthetic baseline
 * for "the rest of the network" makes the share meaningful from the first
 * panel, with naturally diminishing returns as it grows:
 *
 *   share = rate / (rate + baseline) x budget
 *
 * The baseline plays the part of network difficulty. Raising it over time, or
 * deriving it from the real player base, is the lever for long-term balance.
 *
 * @param {number} rate the player's W/s
 * @param {number} baseline synthetic network power, W/s
 * @param {number} budget reward available this cycle
 * @returns {number}
 */
export function computeShare(rate, baseline, budget) {
  if (rate <= 0) return 0;

  const denominator = rate + Math.max(0, baseline);
  if (denominator <= 0) return 0;

  return (rate / denominator) * budget;
}

/**
 * Total power credited to a network, used to show a player where they stand.
 * @param {number} rate
 * @param {number} baseline
 */
export function networkTotal(rate, baseline) {
  return Math.max(0, baseline) + Math.max(0, rate);
}

export default computePowerRate;
