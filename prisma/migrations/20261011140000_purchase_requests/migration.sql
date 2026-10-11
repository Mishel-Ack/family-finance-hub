CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONVERTED');
CREATE TABLE "PurchaseRequest" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "requesterMemberId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "categoryId" TEXT NOT NULL,
  "note" VARCHAR(500) NOT NULL DEFAULT '',
  "neededBy" TIMESTAMP(3),
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "decidedByMemberId" TEXT,
  "decisionNote" VARCHAR(500),
  "decidedAt" TIMESTAMP(3),
  "impactSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseRequest_familyId_status_createdAt_idx" ON "PurchaseRequest"("familyId", "status", "createdAt");
CREATE INDEX "PurchaseRequest_requesterMemberId_status_idx" ON "PurchaseRequest"("requesterMemberId", "status");
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterMemberId_fkey" FOREIGN KEY ("requesterMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_decidedByMemberId_fkey" FOREIGN KEY ("decidedByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
