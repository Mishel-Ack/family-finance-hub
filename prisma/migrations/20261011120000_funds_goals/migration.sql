CREATE TABLE "SinkingFund" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "targetPaise" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "categoryId" TEXT,
  "createdByMemberId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SinkingFund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FundContribution" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "fundId" TEXT NOT NULL,
  "memberId" TEXT,
  "amountPaise" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FundContribution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Goal" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "targetPaise" INTEGER NOT NULL,
  "targetDate" TIMESTAMP(3) NOT NULL,
  "createdByMemberId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SinkingFund_familyId_archivedAt_dueDate_idx" ON "SinkingFund"("familyId", "archivedAt", "dueDate");
CREATE INDEX "FundContribution_familyId_fundId_createdAt_idx" ON "FundContribution"("familyId", "fundId", "createdAt");
CREATE INDEX "Goal_familyId_archivedAt_targetDate_idx" ON "Goal"("familyId", "archivedAt", "targetDate");
ALTER TABLE "SinkingFund" ADD CONSTRAINT "SinkingFund_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SinkingFund" ADD CONSTRAINT "SinkingFund_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SinkingFund" ADD CONSTRAINT "SinkingFund_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FundContribution" ADD CONSTRAINT "FundContribution_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundContribution" ADD CONSTRAINT "FundContribution_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "SinkingFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FundContribution" ADD CONSTRAINT "FundContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
