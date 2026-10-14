-- CreateEnum
CREATE TYPE "CoachMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterEnum
ALTER TYPE "ActivityEntityType" ADD VALUE 'SCENARIO';

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'EXPORT_PERFORMED';
ALTER TYPE "ActivityType" ADD VALUE 'SCENARIO_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'SCENARIO_DELETED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_STORY_READY';
ALTER TYPE "NotificationType" ADD VALUE 'FUND_OFF_TRACK';
ALTER TYPE "NotificationType" ADD VALUE 'ANOMALY';
ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "clientRequestId" TEXT;

-- CreateTable
CREATE TABLE "CoachConversation" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "CoachMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdByMemberId" TEXT,
    "nameSnapshot" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPatternRecord" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPatternRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CoachConversation_familyId_userId_createdAt_idx" ON "CoachConversation"("familyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachMessage_conversationId_createdAt_idx" ON "CoachMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Scenario_familyId_idx" ON "Scenario"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_familyId_name_key" ON "Scenario"("familyId", "name");

-- CreateIndex
CREATE INDEX "RecurringPatternRecord_familyId_idx" ON "RecurringPatternRecord"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPatternRecord_familyId_merchantKey_key" ON "RecurringPatternRecord"("familyId", "merchantKey");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_familyId_userId_clientRequestId_key" ON "Expense"("familyId", "userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "CoachConversation" ADD CONSTRAINT "CoachConversation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachConversation" ADD CONSTRAINT "CoachConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CoachConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPatternRecord" ADD CONSTRAINT "RecurringPatternRecord_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
