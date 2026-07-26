-- One MiningAllocation row per (player, network).
--
-- ## Why
--
-- Nothing stopped duplicates. The route checked for repeated networks in the
-- request body, but the write was a delete-then-create of every row for the
-- player, outside any row lock — so two saves arriving together could interleave
-- their deletes and creates and leave two rows for the same network. The payout
-- cron iterates allocations, so each duplicate row would earn its own payout
-- every cycle.
--
-- With the constraint in place the write becomes an upsert, which is idempotent,
-- and duplicates are rejected by the database rather than by a check that only
-- inspected one request at a time.
--
-- ## Existing duplicates
--
-- Any database that has been running could already hold them, and
-- CREATE UNIQUE INDEX would fail on those rows, so they are collapsed first.
-- The most recently updated row wins, with `id` as a deterministic tiebreak for
-- rows sharing a timestamp — arbitrary but repeatable, which matters because
-- this migration may be applied to several environments and should produce the
-- same result in each.

DELETE FROM "MiningAllocation"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "userId", "network"
        ORDER BY "updatedAt" DESC, "id" DESC
      ) AS row_number
    FROM "MiningAllocation"
  ) ranked
  WHERE ranked.row_number > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "MiningAllocation_userId_network_key" ON "MiningAllocation"("userId", "network");
