-- Adds the two tables that `schema.prisma` declared but no migration ever
-- created, plus the indexes the schema asks for.
--
-- `PlacedMount` and `LedgerEntry` were reachable from application code
-- (`routes/farm.js`, `routes/assets.js`, `services/miningPayout.js`) while being
-- absent from the migration history entirely. A database built with
-- `prisma migrate deploy` therefore failed at runtime on the farm layout, on
-- every purchase, and on every payout cycle — the whole placement feature and
-- the audit trail were missing.
--
-- This migration is purely additive: no existing table loses anything, so it is
-- safe to replay against a database that already has data.

-- CreateTable: the farm grid, server-authoritative.
-- `col`/`row` are the anchor cell (leftmost cell for a multi-cell mount);
-- `panels` has one flag per bay, in slot order.
CREATE TABLE "PlacedMount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "panels" BOOLEAN[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacedMount_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit trail for currency-spending actions.
-- `amount` is always positive; `kind` implies the direction.
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reference" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlacedMount_userId_idx" ON "PlacedMount"("userId");

-- One mount per anchor cell. Overlap of a multi-cell mount cannot be expressed
-- as a constraint, so it is checked in `validateLayout`, which knows the width
-- of each mount type.
CREATE UNIQUE INDEX "PlacedMount_userId_col_row_key" ON "PlacedMount"("userId", "col", "row");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex: indexes declared in the schema but never migrated.
-- The minigame one matters most: the cooldown check queries by (userId, game)
-- ordered by timestamp on every play *and* every status poll, three times per
-- poll, and was doing a sequential scan.
CREATE INDEX "MinigameSession_userId_game_timestamp_idx" ON "MinigameSession"("userId", "game", "timestamp");

CREATE INDEX "PlayerPayout_userId_timestamp_idx" ON "PlayerPayout"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "PlacedMount" ADD CONSTRAINT "PlacedMount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
