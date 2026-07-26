/**
 * Pure function: calculates accumulated W for a single asset.
 *
 * @param {Object} asset - PlayerAsset record (must include lastCollected)
 * @param {number} baseW - Base W per second for this asset type (from AssetCatalog)
 * @returns {number} Total accumulated W since lastCollected (not rounded)
 */
export function calculateAccumulatedW(asset, baseW) {
  const now = new Date();
  const lastCollected = new Date(asset.lastCollected);
  const elapsedMs = now.getTime() - lastCollected.getTime();
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);

  return baseW * asset.quantity * elapsedSeconds;
}