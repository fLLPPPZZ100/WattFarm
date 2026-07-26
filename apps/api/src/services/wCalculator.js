/**
 * Pure function: accumulated W for a single asset since it was last collected.
 *
 * @param {{ lastCollected: Date | string, quantity: number }} asset PlayerAsset record
 * @param {number} baseW W per second per unit, from AssetCatalog
 * @param {Date} [asOf] instant to measure against; defaults to now.
 *   The payout cycle passes an explicit timestamp so the value it pays for and
 *   the value it then consumes describe exactly the same interval.
 * @returns {number} accumulated W (not rounded)
 */
export function calculateAccumulatedW(asset, baseW, asOf) {
  const now = asOf instanceof Date ? asOf : new Date();
  const lastCollected = new Date(asset.lastCollected);

  const elapsedMs = now.getTime() - lastCollected.getTime();
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);

  return baseW * asset.quantity * elapsedSeconds;
}
