import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { httpError, notFound } from "@/lib/http-error";
import { countAllFamilyExpenses } from "@/lib/expense-queries";
import { recordActivity } from "@/lib/activity-queries";

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function acceptInviteInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    token: string;
    userId: string;
    userEmail: string;
    displayName: string;
    leaveExistingFamily: boolean;
  },
) {
  const now = new Date();
  const claimed = await tx.invite.updateMany({
    where: {
      tokenHash: hashInviteToken(input.token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now, usedByUserId: input.userId },
  });
  if (claimed.count !== 1) throw notFound("This invitation is invalid or unavailable.");

  const invite = await tx.invite.findUnique({
    where: { tokenHash: hashInviteToken(input.token) },
    include: { family: true },
  });
  if (!invite) throw notFound("This invitation is invalid or unavailable.");
  if (invite.email && invite.email.toLowerCase() !== input.userEmail.toLowerCase()) {
    throw httpError("This invitation is for a different email address.", 403);
  }

  const memberships = await tx.familyMember.findMany({
    where: { userId: input.userId },
    include: { family: true },
  });
  if (memberships.some(({ familyId }) => familyId === invite.familyId)) {
    throw httpError("This account is already a member of that family.", 409);
  }

  if (memberships.length > 0) {
    const current = memberships[0];
    const canLeave =
      memberships.length === 1 &&
      current?.role === "OWNER" &&
      current.family.ownerId === input.userId &&
      (await tx.familyMember.count({ where: { familyId: current.familyId } })) === 1 &&
      (await countAllFamilyExpenses(tx, current.familyId)) === 0 &&
      (await tx.budget.count({ where: { familyId: current.familyId } })) === 0;

    if (!canLeave) {
      throw httpError(
        "This account already belongs to a family with other members or financial activity. Ask that family to remove your account before joining another.",
        409,
      );
    }
    if (!input.leaveExistingFamily) {
      throw httpError(
        "This account belongs to an empty solo family. Confirm that you want to leave it and join this family.",
        409,
      );
    }
    await tx.family.delete({ where: { id: current.familyId } });
  }

  const member = await tx.familyMember.create({
    data: {
      familyId: invite.familyId,
      userId: input.userId,
      displayName: input.displayName,
      role: invite.role,
    },
  });
  await recordActivity(
    tx,
    {
      familyId: invite.familyId,
      memberId: member.id,
      userId: input.userId,
      role: member.role,
      user: { id: input.userId, name: input.displayName, email: input.userEmail },
    },
    {
      type: "MEMBER_JOINED",
      entityType: "MEMBER",
      entityId: member.id,
      summary: { displayName: member.displayName.slice(0, 80), role: member.role },
    },
  );
  return { invite, member };
}

export function assertInviteAcceptRateLimit(ip: string) {
  const now = Date.now();
  const entry = inviteAcceptAttempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= 5) {
    throw httpError("Too many invite attempts. Please try again in 15 minutes.", 429);
  }
  if (!entry || entry.resetAt <= now) {
    inviteAcceptAttempts.set(ip, { count: 1, resetAt: now + FIFTEEN_MINUTES });
  } else {
    entry.count += 1;
  }
}

export function resetInviteRateLimitForTests() {
  if (process.env["NODE_ENV"] !== "test") {
    throw new Error("Invite rate limit test seam only available in test mode");
  }
  inviteAcceptAttempts.clear();
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const inviteAcceptAttempts = new Map<string, { count: number; resetAt: number }>();
