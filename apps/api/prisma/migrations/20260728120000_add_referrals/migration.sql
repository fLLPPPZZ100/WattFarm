-- Referral identity, attribution, and the daily commission ledger.
--
-- ## Why every statement is guarded
--
-- Prisma does not wrap a migration file in a transaction, so a run that fails
-- part way through leaves the statements before the failure committed. The first
-- version of this migration was not re-runnable: retrying it aborted on
-- `ADD COLUMN "referralCode"` with 42701 (column already exists), and because
-- the failure is recorded in `_prisma_migrations`, no later migration could be
-- applied either.
--
-- The same guards also make this safe to apply to a database where the schema
-- was already synced by `prisma db push`, which creates the columns without
-- recording a migration.
--
-- `ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL, hence the DO blocks
-- that check `pg_constraint` first. `SET NOT NULL` and the backfill `UPDATE` are
-- naturally idempotent.

-- AlterTable: referral columns on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredAt" TIMESTAMP(3);

-- Backfill: every existing account needs a code before the NOT NULL constraint.
--
-- md5 is seeded with the row id as well as random(), so two rows cannot collide
-- even if random() repeats within the statement. The generated codes are
-- uppercase hex; application-generated codes use a wider, ambiguity-free
-- alphabet, and validation accepts /^[A-Z0-9]{6,12}$/, which covers both.
UPDATE "User"
SET "referralCode" = upper(substr(md5(random()::text || "id"), 1, 8))
WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReferralCommission" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodDate" TIMESTAMP(3) NOT NULL,
    "sourceAmount" DECIMAL(18,4) NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById");

-- CreateIndex: the settlement key. Makes a repeated run for the same day a
-- unique violation instead of a duplicate payment.
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommission_referrerId_referredId_kind_periodDate_key" ON "ReferralCommission"("referrerId", "referredId", "kind", "periodDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReferralCommission_referrerId_createdAt_idx" ON "ReferralCommission"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReferralCommission_referredId_periodDate_idx" ON "ReferralCommission"("referredId", "periodDate");

-- AddForeignKey
DO $$
BEGIN
    -- Scoped to the table, not just the name: constraint names are unique per
    -- table, not per database, so a name check alone could match something else.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'User_referredById_fkey' AND conrelid = '"User"'::regclass
    ) THEN
        ALTER TABLE "User"
            ADD CONSTRAINT "User_referredById_fkey"
            FOREIGN KEY ("referredById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ReferralCommission_referrerId_fkey'
          AND conrelid = '"ReferralCommission"'::regclass
    ) THEN
        ALTER TABLE "ReferralCommission"
            ADD CONSTRAINT "ReferralCommission_referrerId_fkey"
            FOREIGN KEY ("referrerId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ReferralCommission_referredId_fkey'
          AND conrelid = '"ReferralCommission"'::regclass
    ) THEN
        ALTER TABLE "ReferralCommission"
            ADD CONSTRAINT "ReferralCommission_referredId_fkey"
            FOREIGN KEY ("referredId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
