-- Money columns move from DOUBLE PRECISION to DECIMAL(18,4), and User.email
-- becomes nullable.
--
-- ## Why this migration exists
--
-- `schema.prisma` had already been changed to `Decimal(18,4)` and to a nullable
-- email, but no migration was ever generated for either change. Development ran
-- against a database shaped by `prisma db push`, so it looked correct locally,
-- while anything built from the migration history still had float money columns
-- and a NOT NULL email. That silently defeated `lib/money.js`: every credit and
-- debit went back through IEEE-754 the moment it touched the database, which is
-- the exact drift that module exists to prevent.
--
-- ## Why the USING clauses are explicit
--
-- Postgres would accept a bare `SET DATA TYPE DECIMAL(18,4)` here, because
-- double precision -> numeric is an assignment cast. Rounding to the target
-- scale is a *data* decision though, so it is spelled out rather than left to
-- an implicit cast: reviewers can see that values are rounded half-up to four
-- places and not truncated. Balances in practice carry at most two decimals,
-- so this is lossless for existing rows.

-- AlterTable: User.email becomes nullable
-- Some Firebase providers (anonymous, phone) supply no address at all.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- A previous revision defaulted the missing address to '' instead of NULL.
-- Postgres treats '' as a real value under a unique index, so only one such row
-- could ever exist and the second provider-less signup failed on a unique
-- violation. Now that the column allows NULL, normalise the sentinel away.
UPDATE "User" SET "email" = NULL WHERE "email" = '';

-- AlterTable: currency columns become exact decimals
ALTER TABLE "User"
  ALTER COLUMN "vltBalance" SET DATA TYPE DECIMAL(18,4) USING ROUND("vltBalance"::numeric, 4);

ALTER TABLE "AssetCatalog"
  ALTER COLUMN "basePrice" SET DATA TYPE DECIMAL(18,4) USING ROUND("basePrice"::numeric, 4);

-- `vltEarned` also gains the default it has in the schema; the initial
-- migration created it NOT NULL with no default.
-- Split into two statements rather than two subcommands of one ALTER TABLE:
-- retyping a column and resetting its default in the same statement is
-- accepted by Postgres but the interaction is subtle enough that it is not
-- worth relying on in a migration that cannot be re-run.
ALTER TABLE "MinigameSession"
  ALTER COLUMN "vltEarned" SET DATA TYPE DECIMAL(18,4) USING ROUND("vltEarned"::numeric, 4);

ALTER TABLE "MinigameSession" ALTER COLUMN "vltEarned" SET DEFAULT 0;

ALTER TABLE "PlayerPayout"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,4) USING ROUND("amount"::numeric, 4);

-- Note: `AssetCatalog.multiplier`, `AssetCatalog.baseW` and
-- `MiningAllocation.percentage` stay DOUBLE PRECISION on purpose. They are
-- ratios and physical rates, not currency, so binary floating point is the
-- right representation and no exactness guarantee is being made about them.
