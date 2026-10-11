CREATE TYPE "InsightType" AS ENUM ('MID_MONTH_OVERSPEND', 'CATEGORY_ANOMALY', 'DUPLICATE_CHARGE', 'RECURRING_BILL', 'PRICE_INCREASE', 'FORECAST', 'FINANCIAL_HEALTH');
CREATE TYPE "InsightSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "InsightVerdict" AS ENUM ('USEFUL', 'NOT_USEFUL', 'DISMISS');

CREATE TABLE "Insight" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "type" "InsightType" NOT NULL,
  "key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "severity" "InsightSeverity" NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedAt" TIMESTAMP(3),
  "dismissedByUserId" TEXT,
  CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncomeProfile" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "monthlyIncomePaise" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomeProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsightFeedback" (
  "id" TEXT NOT NULL,
  "insightId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verdict" "InsightVerdict" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsightFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Insight_familyId_type_key_key" ON "Insight"("familyId", "type", "key");
CREATE INDEX "Insight_familyId_dismissedAt_computedAt_idx" ON "Insight"("familyId", "dismissedAt", "computedAt");
CREATE UNIQUE INDEX "IncomeProfile_familyId_key" ON "IncomeProfile"("familyId");
CREATE UNIQUE INDEX "InsightFeedback_insightId_userId_key" ON "InsightFeedback"("insightId", "userId");
CREATE INDEX "InsightFeedback_userId_createdAt_idx" ON "InsightFeedback"("userId", "createdAt");

ALTER TABLE "Insight" ADD CONSTRAINT "Insight_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncomeProfile" ADD CONSTRAINT "IncomeProfile_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
