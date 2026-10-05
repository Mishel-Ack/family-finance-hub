CREATE TYPE "ExpenseVisibility" AS ENUM ('SHARED', 'PRIVATE');
ALTER TABLE "Expense" ADD COLUMN "visibility" "ExpenseVisibility" NOT NULL DEFAULT 'SHARED';
CREATE INDEX "Expense_familyId_visibility_date_idx" ON "Expense"("familyId", "visibility", "date");
