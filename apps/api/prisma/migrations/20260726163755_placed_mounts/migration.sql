-- CreateTable
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

-- CreateIndex
CREATE INDEX "PlacedMount_userId_idx" ON "PlacedMount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacedMount_userId_col_row_key" ON "PlacedMount"("userId", "col", "row");

-- AddForeignKey
ALTER TABLE "PlacedMount" ADD CONSTRAINT "PlacedMount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
