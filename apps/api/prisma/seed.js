import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assets = [
    { type: 'solar', basePrice: 10, multiplier: 1.15, baseW: 1 },
    { type: 'panel-mount', basePrice: 15, multiplier: 1, baseW: 0 },
    { type: 'panel-mount-double', basePrice: 25, multiplier: 1, baseW: 0 },
  ];

  for (const asset of assets) {
    await prisma.assetCatalog.upsert({
      where: { type: asset.type },
      update: {},
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