-- AlterTable: referral identity and attribution on User
--
-- `referralCode` is NOT NULL UNIQUE, so existing rows have to be backfilled
-- before the constraint is added. The backfill seeds md5 with the row id as
-- well as random(), so two rows cannot collide even if random() repeats within
-- the statement; the unique index below would fail loudly if it ever did.
--
-- The generated codes are uppercase hex. Application-generated codes use a
-- wider, ambiguity-free alphabet — validation accepts /^[A-Z0-9]{6,12}$/, which
-- covers both.
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT;

UPDATE "User" SET "referralCode" = upper(substr(md5(random()::text || "id"), 1, 8)) WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "referredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReferralCommission" (
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
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex: the settlement key. Makes a repeated run for the same day a
-- unique violation instead of a duplicate payment.
CREATE UNIQUE INDEX "ReferralCommission_referrerId_referredId_kind_periodDate_key" ON "ReferralCommission"("referrerId", "referredId", "kind", "periodDate");

-- CreateIndex
CREATE INDEX "ReferralCommission_referrerId_createdAt_idx" ON "ReferralCommission"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralCommission_referredId_periodDate_idx" ON "ReferralCommission"("referredId", "periodDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
