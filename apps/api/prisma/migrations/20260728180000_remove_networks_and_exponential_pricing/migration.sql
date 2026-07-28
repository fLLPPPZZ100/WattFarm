-- Two removals: the multi-network mining model, and exponential pricing.
--
-- ── Networks ────────────────────────────────────────────────────────────────
-- Wind and hydro never existed as placeable assets. They had budget lines and
-- allocation percentages but nothing to place, so two thirds of the payout
-- budget was never distributed and the split had exactly one useful setting:
-- 100% solar.
--
-- With a single source of power there is nothing to allocate, so MiningAllocation
-- goes entirely. The payout cron now walks players who have placed mounts.
--
-- This also removes a failure mode rather than just a table: a player with no
-- allocation row was skipped by the cron — panels placed, counter rising, no
-- earnings ever — and the row was created in exactly one place.
DROP TABLE "MiningAllocation";

-- ── Pricing ─────────────────────────────────────────────────────────────────
-- `multiplier` drove `price = basePrice * multiplier ^ owned`. Every row was
-- seeded at 1, so the escalation never applied and the geometric-series code
-- that read it was dead weight in the buy path. Prices are fixed, and the column
-- is renamed to say so.
ALTER TABLE "AssetCatalog" DROP COLUMN "multiplier";
ALTER TABLE "AssetCatalog" RENAME COLUMN "basePrice" TO "price";
