CREATE TABLE "MonthlyReport" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "narrative" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonthlyReport_familyId_month_year_key" ON "MonthlyReport"("familyId", "month", "year");
CREATE INDEX "MonthlyReport_familyId_year_month_idx" ON "MonthlyReport"("familyId", "year", "month");
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
