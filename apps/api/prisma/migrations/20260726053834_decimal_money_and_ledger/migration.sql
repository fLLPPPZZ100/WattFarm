/*
  Warnings:

  - You are about to alter the column `basePrice` on the `AssetCatalog` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `vltEarned` on the `MinigameSession` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `amount` on the `PlayerPayout` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.
  - You are about to alter the column `vltBalance` on the `User` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,4)`.

*/
-- AlterTable
ALTER TABLE "AssetCatalog" ALTER COLUMN "basePrice" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "MinigameSession" ALTER COLUMN "vltEarned" SET DEFAULT 0,
ALTER COLUMN "vltEarned" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PlayerPayout" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "vltBalance" SET DATA TYPE DECIMAL(18,4);

-- CreateTable
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
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MinigameSession_userId_game_timestamp_idx" ON "MinigameSession"("userId", "game", "timestamp");

-- CreateIndex
CREATE INDEX "PlayerPayout_userId_timestamp_idx" ON "PlayerPayout"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
