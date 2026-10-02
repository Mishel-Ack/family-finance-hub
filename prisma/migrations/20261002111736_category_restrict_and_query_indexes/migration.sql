-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_categoryId_fkey";

-- CreateIndex
CREATE INDEX "Category_familyId_archivedAt_idx" ON "Category"("familyId", "archivedAt");

-- CreateIndex
CREATE INDEX "Expense_familyId_memberId_date_idx" ON "Expense"("familyId", "memberId", "date");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
