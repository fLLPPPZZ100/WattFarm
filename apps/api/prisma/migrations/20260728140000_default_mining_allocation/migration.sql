-- Guarantees every account has exactly one mining allocation per network.
--
-- Three steps, in this order:
--   1. remove duplicate (userId, network) rows, or the unique index cannot be
--      created. Duplicates were reachable: the write path was `deleteMany`
--      followed by `create` with no lock, so two concurrent requests could
--      interleave. The payout iterates over rows, so a duplicate paid twice.
--   2. add the constraint that makes that state impossible.
--   3. backfill accounts with no allocation at all. Without a row the payout
--      cron skips the player, which is why nobody has ever been paid.

-- Keep the oldest row of each duplicated pair and drop the rest.
DELETE FROM "MiningAllocation" a
USING "MiningAllocation" b
WHERE a."userId" = b."userId"
  AND a."network" = b."network"
  AND a."id" > b."id";

-- CreateIndex
CREATE UNIQUE INDEX "MiningAllocation_userId_network_key" ON "MiningAllocation"("userId", "network");

-- CreateIndex
CREATE INDEX "MiningAllocation_network_idx" ON "MiningAllocation"("network");

-- Backfill: 100% solar for every account that has no allocation yet.
--
-- Solar is the only network with a placeable asset, so it is the only setting
-- that can earn anything today. Accounts that already chose a split are left
-- alone — the `NOT EXISTS` covers any allocation, not just solar.
--
-- `id` is built with md5 rather than gen_random_uuid() so this needs no
-- extension and no minimum PostgreSQL version, and is deterministic if it has
-- to run twice. The column is TEXT, so the value only has to be unique.
INSERT INTO "MiningAllocation" ("id", "userId", "network", "percentage", "createdAt", "updatedAt")
SELECT
    md5(u."id" || ':solar'),
    u."id",
    'solar',
    100,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
    SELECT 1 FROM "MiningAllocation" m WHERE m."userId" = u."id"
)
ON CONFLICT DO NOTHING;
