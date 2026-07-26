/**
 * Rules for mining allocation splits.
 *
 * Kept free of Prisma, Express and config imports so it can be exercised
 * directly — the validation is the anti-cheat boundary for a route that decides
 * income, and it is the part most worth testing in isolation.
 */

/** Networks a player may point power at. */
export const VALID_NETWORKS = Object.freeze(['solar', 'wind', 'hydro']);

/**
 * Slack allowed on the sum. Percentages arrive as floats from a slider, so
 * demanding exactly 100 would reject legitimate input.
 */
export const ALLOCATION_TOLERANCE = 0.01;

/**
 * Validates a submitted allocation set.
 *
 * Returns `{ problems, allocations }`, the same shape as `validateLayout` in
 * routes/farm.js so both config endpoints report errors identically. `problems`
 * is empty when the input is acceptable, and `allocations` is then the
 * normalised set to persist.
 *
 * ## Ordering
 *
 * Every entry is validated individually *before* the sum is considered, because
 * a sum is only meaningful once each value is known to be a number in range.
 * The previous implementation checked the sum first, so
 * `[{solar: 150}, {wind: -60}]` was rejected with "must sum to 100" — accurate,
 * but it buried the real mistake and pointed the player at the wrong field.
 *
 * @param {unknown} raw the `allocations` field of the request body
 * @returns {{ problems: string[], allocations?: {network: string, percentage: number}[] }}
 */
export function validateAllocations(raw) {
  if (!Array.isArray(raw)) return { problems: ['`allocations` must be an array'] };
  if (raw.length === 0) return { problems: ['`allocations` must contain at least one entry'] };

  // Cap before iterating: with only three networks anything longer is already
  // invalid, and an oversized payload should not be walked in full.
  if (raw.length > VALID_NETWORKS.length) {
    return { problems: [`at most ${VALID_NETWORKS.length} allocations may be submitted`] };
  }

  const problems = [];
  const seen = new Set();
  const allocations = [];

  raw.forEach((entry, index) => {
    const network = entry?.network;
    if (!VALID_NETWORKS.includes(network)) {
      problems.push(
        `allocation ${index}: unknown network "${network}" ` +
          `(expected one of: ${VALID_NETWORKS.join(', ')})`
      );
      return;
    }

    // Two entries for the same network could otherwise sum to 100 and silently
    // overwrite each other.
    if (seen.has(network)) {
      problems.push(`allocation ${index}: duplicate entry for "${network}"`);
      return;
    }
    seen.add(network);

    const percentage = entry?.percentage;
    // Checked before any arithmetic: a string or null would coerce and let the
    // sum pass with nonsense values.
    if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
      problems.push(`allocation ${index}: percentage must be a finite number`);
      return;
    }

    if (percentage < 0 || percentage > 100) {
      problems.push(
        `allocation ${index}: percentage must be between 0 and 100 (got ${percentage})`
      );
      return;
    }

    allocations.push({ network, percentage });
  });

  if (problems.length > 0) return { problems };

  const total = allocations.reduce((sum, allocation) => sum + allocation.percentage, 0);
  if (Math.abs(total - 100) > ALLOCATION_TOLERANCE) {
    return {
      problems: [
        `allocation percentages must sum to 100 (received ${Math.round(total * 100) / 100})`,
      ],
    };
  }

  return { problems: [], allocations };
}

export default validateAllocations;
