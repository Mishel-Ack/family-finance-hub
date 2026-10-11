CREATE TYPE "CorrectionScope" AS ENUM ('SHARED', 'PRIVATE');

CREATE TABLE "CategoryCorrection" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "merchantKey" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "scope" "CorrectionScope" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoryCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryCorrection_familyId_userId_merchantKey_scope_key" ON "CategoryCorrection"("familyId", "userId", "merchantKey", "scope");
CREATE INDEX "CategoryCorrection_familyId_merchantKey_scope_idx" ON "CategoryCorrection"("familyId", "merchantKey", "scope");
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryCorrection" ADD CONSTRAINT "CategoryCorrection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
