CREATE TYPE "ActivityType" AS ENUM (
  'EXPENSE_CREATED',
  'EXPENSE_UPDATED',
  'EXPENSE_DELETED',
  'BUDGET_UPSERTED',
  'BUDGET_DELETED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_ARCHIVED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_CHANGED',
  'OWNERSHIP_TRANSFERRED',
  'INVITE_CREATED',
  'INVITE_REVOKED',
  'SPLIT_CREATED',
  'SETTLEMENT_RECORDED'
);

CREATE TYPE "ActivityEntityType" AS ENUM (
  'EXPENSE', 'BUDGET', 'CATEGORY', 'MEMBER', 'FAMILY', 'INVITE', 'SPLIT', 'SETTLEMENT'
);

ALTER TABLE "Expense" ADD COLUMN "memberIdSnapshot" TEXT;

CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "actorMemberId" TEXT,
  "actorNameSnapshot" TEXT NOT NULL,
  "type" "ActivityType" NOT NULL,
  "entityType" "ActivityEntityType" NOT NULL,
  "entityId" TEXT,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityLog_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ActivityLog_familyId_createdAt_id_idx" ON "ActivityLog"("familyId", "createdAt", "id");
CREATE INDEX "ActivityLog_familyId_entityType_entityId_idx" ON "ActivityLog"("familyId", "entityType", "entityId");
