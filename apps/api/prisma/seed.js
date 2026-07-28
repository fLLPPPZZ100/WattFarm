import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  /**
   * The double mount is priced above two singles on purpose.
   *
   * At 25 VLT it cost 12.50 per bay against the single's 15.00, so it was
   * cheaper per panel *and* more space efficient — the single had no reason to
   * exist. At 45 it costs 22.50 per bay: worse per watt, better per cell. That
   * is the intended trade, since grid space is the scarce resource.
   */
  const assets = [
    // Solar panels are flat-priced: `multiplier: 1` means every panel costs the
    // same 10 VLT no matter how many are already owned. The pricing code in
    // routes/assets.js treats `multiplier <= 1` as flat, so `currentPrice`
    // always equals `basePrice` and buying N units costs exactly basePrice × N.
    { type: 'solar', basePrice: 10, multiplier: 1, baseW: 1 },
    { type: 'panel-mount', basePrice: 15, multiplier: 1, baseW: 0 },
    { type: 'panel-mount-double', basePrice: 45, multiplier: 1, baseW: 0 },
  ];

  for (const asset of assets) {
    await prisma.assetCatalog.upsert({
      where: { type: asset.type },
      // Prices are re-applied on every seed run; `update: {}` meant a rebalance
      // never reached an existing database.
      update: { basePrice: asset.basePrice, multiplier: asset.multiplier, baseW: asset.baseW },
      create: asset,
    });
  }

  console.log('AssetCatalog seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());