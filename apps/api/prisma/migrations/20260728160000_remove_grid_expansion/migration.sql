-- Removes the grid expansion feature.
--
-- The grid is a fixed 14x4 again, so `User.gridRows` has nothing left to say.
-- The earlier migration that added it (20260727071800_add_grid_expansion) is
-- left in place: applied migrations are history and must not be edited.
--
-- Mounts anchored outside the fixed grid are dropped first. Nothing can render
-- them any more, but `computePowerRate` reads straight from PlacedMount and
-- would keep counting their panels at payout time — income from panels the
-- player cannot see or remove. In practice this deletes nothing, since the
-- expansion was never reachable from the UI.
DELETE FROM "PlacedMount" WHERE "row" >= 4;

ALTER TABLE "User" DROP COLUMN "gridRows";

-- LedgerEntry rows with kind = 'grid-expansion' are deliberately kept. The
-- ledger is an audit trail: deleting entries would leave a balance that cannot
-- be reconstructed from its history.
