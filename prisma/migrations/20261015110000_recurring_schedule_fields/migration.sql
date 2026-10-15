ALTER TABLE "RecurringPatternRecord"
ADD COLUMN "intervalDays" INTEGER,
ADD COLUMN "nextExpectedAt" DATE,
ADD COLUMN "typicalAmountPaise" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'DETECTED';

CREATE INDEX "RecurringPatternRecord_familyId_status_nextExpectedAt_idx"
ON "RecurringPatternRecord"("familyId", "status", "nextExpectedAt");
