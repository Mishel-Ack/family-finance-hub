CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'EXACT', 'PERCENT');
ALTER TYPE "ActivityType" ADD VALUE 'SETTLEMENT_DELETED';
ALTER TABLE "FamilyMember" ADD COLUMN "formerAt" TIMESTAMP(3);
CREATE TABLE "ExpenseSplit" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sharePaise" INTEGER NOT NULL,
  "mode" "SplitMode" NOT NULL DEFAULT 'EXACT',
  "basisPoints" INTEGER,
  CONSTRAINT "ExpenseSplit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseSplit_sharePaise_check" CHECK ("sharePaise" > 0),
  CONSTRAINT "ExpenseSplit_basisPoints_check" CHECK ("basisPoints" IS NULL OR ("basisPoints" > 0 AND "basisPoints" <= 10000))
);
CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "fromMemberId" TEXT NOT NULL,
  "toMemberId" TEXT NOT NULL,
  "fromNameSnapshot" TEXT NOT NULL,
  "toNameSnapshot" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "note" VARCHAR(200) NOT NULL DEFAULT '',
  "createdByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Settlement_amountPaise_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "Settlement_distinct_members_check" CHECK ("fromMemberId" <> "toMemberId")
);
CREATE UNIQUE INDEX "ExpenseSplit_expenseId_memberId_key" ON "ExpenseSplit"("expenseId", "memberId");
CREATE INDEX "ExpenseSplit_memberId_idx" ON "ExpenseSplit"("memberId");
CREATE INDEX "Settlement_familyId_createdAt_idx" ON "Settlement"("familyId", "createdAt");
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
