ALTER TABLE "Expense" ADD COLUMN "memberNameSnapshot" TEXT;
UPDATE "Expense" AS e
SET "memberNameSnapshot" = fm."displayName"
FROM "FamilyMember" AS fm
WHERE e."memberId" = fm."id" AND e."memberNameSnapshot" IS NULL;

ALTER TABLE "Invite" ADD COLUMN "createdByDisplayNameSnapshot" TEXT NOT NULL DEFAULT '';
UPDATE "Invite" AS i
SET "createdByDisplayNameSnapshot" = fm."displayName"
FROM "FamilyMember" AS fm
WHERE i."createdByMemberId" = fm."id";

ALTER TABLE "Invite" DROP CONSTRAINT "Invite_createdByMemberId_fkey";
ALTER TABLE "Invite" ALTER COLUMN "createdByMemberId" DROP NOT NULL;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
