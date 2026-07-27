/**
 * Minigame Engine — server-side only.
 *
 * Cooldown tiers (seconds):
 *   Tier 0: 10s  (plays 0-4 today)
 *   Tier 1: 60s  (plays 5-9 today)
 *   Tier 2: 300s (5min, plays 10-19 today)
 *   Tier 3: 600s (10min, plays 20+ today)
 *
 * Loot table (EV = 0.55 VLT/play):
 *   none:    96.95%
 *   common:   2.50%  → 10 VLT
 *   rare:     0.50%  → 50 VLT
 *   epic:     0.05%  → 100 VLT
 */

const COOLDOWN_TIERS = [10, 60, 300, 600];

const LOOT_TABLE = [
  { result: 'epic', threshold: 0.0005, vlt: 100 },
  { result: 'rare', threshold: 0.0055, vlt: 50 },    // cumulative: 0.0005 + 0.0050 = 0.0055
  { result: 'common', threshold: 0.0305, vlt: 10 },  // cumulative: 0.0055 + 0.0250 = 0.0305
  { result: 'none', threshold: 1.0, vlt: 0 },        // remainder — EV = 0.55 VLT/play (3x previous)
];

/**
 * Determine the player's current cooldown tier based on
 * how many times they've played this game today.
 */
export function getCooldownTier(playCountToday) {
  if (playCountToday < 5) return 0;
  if (playCountToday < 10) return 1;
  if (playCountToday < 20) return 2;
  return 3;
}

/**
 * Get cooldown duration in seconds for a given tier.
 */
export function getCooldownSeconds(tier) {
  return COOLDOWN_TIERS[tier] || COOLDOWN_TIERS[3];
}

/**
 * Returns the number of milliseconds since the last play session ended.
 * Returns Infinity if no previous session exists (never played today = ready).
 */
export function getCooldownRemainingMs(lastPlayedAt, playCountToday) {
  if (!lastPlayedAt) return 0;
  const tier = getCooldownTier(playCountToday);
  const cooldownMs = getCooldownSeconds(tier) * 1000;
  const elapsedMs = Date.now() - new Date(lastPlayedAt).getTime();
  const remainingMs = Math.max(0, cooldownMs - elapsedMs);
  return remainingMs;
}

/**
 * Roll the dice. Returns { result, vlt }.
 * RNG is server-side only — never trust client values.
 */
export function rollLoot() {
  const roll = Math.random();
  for (const entry of LOOT_TABLE) {
    if (roll <= entry.threshold) {
      return { result: entry.result, vlt: entry.vlt };
    }
  }
  return { result: 'none', vlt: 0 };
}