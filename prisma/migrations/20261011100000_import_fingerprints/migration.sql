CREATE TABLE "ImportFingerprint" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportFingerprint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportFingerprint_familyId_hash_key" ON "ImportFingerprint"("familyId", "hash");
CREATE INDEX "ImportFingerprint_familyId_createdAt_idx" ON "ImportFingerprint"("familyId", "createdAt");
ALTER TABLE "ImportFingerprint" ADD CONSTRAINT "ImportFingerprint_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
