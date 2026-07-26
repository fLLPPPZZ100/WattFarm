import cron from 'node-cron';
import prisma from '../lib/prisma.js';
import { calculateAccumulatedW } from './wCalculator.js';

/**
 * Simulated mining payout: runs every 10 minutes.
 *
 * For each network (solar/wind/hydro), calculates total W accumulated
 * by all players who allocated % to that network. Then distributes
 * a "fictitious budget" proportionally — 100% simulated, no real crypto.
 */

const BUDGET_PER_NETWORK = {
  solar: 50,
  wind: 50,
  hydro: 50,
};

export function startMiningPayoutCron() {
  console.log('[MiningPayout] Cron job scheduled every 10 minutes');

  cron.schedule('*/10 * * * *', async () => {
    console.log('[MiningPayout] Running payout cycle...');

    try {
      const networks = ['solar', 'wind', 'hydro'];

      // Load catalog for baseW lookup
      const catalog = await prisma.assetCatalog.findMany();
      const baseWMap = {};
      for (const c of catalog) {
        baseWMap[c.type] = c.baseW;
      }

      for (const network of networks) {
        // Get all allocations for this network
        const allocations = await prisma.miningAllocation.findMany({
          where: { network },
        });

        if (allocations.length === 0) continue;

        // For each allocation, calculate accumulated W from the player's assets of that type
        const playerContributions = await Promise.all(
          allocations.map(async (alloc) => {
            const playerAsset = await prisma.playerAsset.findFirst({
              where: { userId: alloc.userId, type: network },
            });

            if (!playerAsset || playerAsset.quantity === 0) return null;

            const accumulatedW = calculateAccumulatedW(playerAsset, baseWMap[network] || 0);
            const effectiveW = accumulatedW * (alloc.percentage / 100);

            return {
              userId: alloc.userId,
              effectiveW,
              percentage: alloc.percentage,
              assetW: accumulatedW,
            };
          })
        );

        const validContributions = playerContributions.filter(Boolean);
        if (validContributions.length === 0) continue;

        // Total effective W for this network
        const totalEffectiveW = validContributions.reduce((sum, c) => sum + c.effectiveW, 0);
        if (totalEffectiveW <= 0) continue;

        const budget = BUDGET_PER_NETWORK[network] || 50;

        // Distribute budget proportionally
        for (const contrib of validContributions) {
          const share = (contrib.effectiveW / totalEffectiveW) * budget;
          const payoutAmount = Math.round(share * 100) / 100;

          if (payoutAmount <= 0) continue;

          // Credit VLT + create payout record
          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: contrib.userId },
              data: { vltBalance: { increment: payoutAmount } },
            });

            await tx.playerPayout.create({
              data: {
                userId: contrib.userId,
                amount: payoutAmount,
                details: JSON.stringify({
                  network,
                  effectiveW: Math.round(contrib.effectiveW * 100) / 100,
                  totalEffectiveW: Math.round(totalEffectiveW * 100) / 100,
                  percentage: contrib.percentage,
                  budget,
                }),
              },
            });
          });
        }
      }

      console.log('[MiningPayout] Cycle complete');
    } catch (err) {
      console.error('[MiningPayout] Error during payout cycle:', err);
    }
  });
}