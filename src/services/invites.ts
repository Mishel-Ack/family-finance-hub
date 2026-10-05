import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { assertCan, requireSessionUser, requireMember } from "@/lib/authz";
import { assertSameOrigin, getHeader } from "@/lib/http-utils";
import {
  hashInviteToken,
  acceptInviteInTransaction,
  assertInviteAcceptRateLimit,
} from "@/lib/invite-acceptance";
import { httpError, notFound } from "@/lib/http-error";
import { recordActivity } from "@/lib/activity-queries";
import {
  acceptInviteSchema,
  idSchema,
  inviteCreateSchema,
  inviteTokenSchema,
} from "@/lib/validations";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function unavailableInvite(): never {
  throw notFound("This invitation is invalid or unavailable.");
}

export const getInviteDetailsFn = createServerFn({ method: "GET" })
  .validator(inviteTokenSchema)
  .handler(async ({ data: token }) => {
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { family: true, createdByMember: { include: { user: true } } },
    });
    if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
      unavailableInvite();
    }
    return {
      familyName: invite.family.name,
      inviterName:
        invite.createdByMember?.displayName ||
        invite.createdByMember?.user?.name ||
        invite.createdByDisplayNameSnapshot ||
        "A family member",
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  });

export const createInviteFn = createServerFn({ method: "POST" })
  .validator(inviteCreateSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("invite:create");
    if (data.role === "ADMIN") assertCan(auth.role, "invite:createAdmin");

    let appOrigin: string;
    try {
      appOrigin = new URL(process.env["APP_ORIGIN"] ?? "").origin;
    } catch {
      throw httpError("Invite links are not configured for this application.", 500);
    }

    const token = randomBytes(32).toString("base64url");
    const creator = await prisma.familyMember.findFirst({
      where: { id: auth.memberId, familyId: auth.familyId, formerAt: null },
      select: { displayName: true },
    });
    const invite = await prisma.$transaction(async (tx) => {
      const creator = await tx.familyMember.findFirst({
        where: { id: auth.memberId, familyId: auth.familyId, formerAt: null },
        select: { displayName: true },
      });
      const createdInvite = await tx.invite.create({
        data: {
          familyId: auth.familyId,
          createdByMemberId: auth.memberId,
          createdByDisplayNameSnapshot: creator?.displayName || auth.user.name,
          role: data.role,
          tokenHash: hashInviteToken(token),
          email: data.email || null,
          expiresAt: new Date(Date.now() + SEVEN_DAYS),
        },
      });
      await recordActivity(tx, auth, {
        type: "INVITE_CREATED",
        entityType: "INVITE",
        entityId: createdInvite.id,
        summary: { role: createdInvite.role },
      });
      return createdInvite;
    });
    return {
      id: invite.id,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      link: `${appOrigin}/join/${token}`,
    };
  });

export const listPendingInvitesFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("invite:list");
  const invites = await prisma.invite.findMany({
    where: {
      familyId: auth.familyId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { createdByMember: true },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((invite) => ({
    id: invite.id,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    createdBy: invite.createdByMember?.displayName || invite.createdByDisplayNameSnapshot,
    creatorStatus: invite.createdByMember?.formerAt
      ? "REMOVED"
      : (invite.createdByMember?.role ?? "REMOVED"),
  }));
});

export const revokeInviteFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("invite:revoke");
    await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findFirst({
        where: {
          id,
          familyId: auth.familyId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!invite) throw notFound("Invitation not found.");
      const revoked = await tx.invite.updateMany({
        where: {
          id,
          familyId: auth.familyId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) throw notFound("Invitation not found.");
      await recordActivity(tx, auth, {
        type: "INVITE_REVOKED",
        entityType: "INVITE",
        entityId: invite.id,
        summary: { role: invite.role },
      });
    });
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(acceptInviteSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireSessionUser();
    assertInviteAcceptRateLimit(
      getHeader("x-forwarded-for") ?? getHeader("x-real-ip") ?? "unknown",
    );
    try {
      return await prisma.$transaction(async (tx) => {
        const { invite, member } = await acceptInviteInTransaction(tx, {
          token: data.token,
          userId: auth.userId,
          userEmail: auth.user.email,
          displayName: auth.user.name,
          leaveExistingFamily: data.leaveExistingFamily,
        });
        return { familyId: invite.familyId, familyName: invite.family.name, role: member.role };
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw httpError("This account could not join because it already belongs to a family.", 409);
      }
      throw error;
    }
  });

export function createInvite(input: { role: "ADMIN" | "MEMBER" | "VIEWER"; email?: string }) {
  return createInviteFn({ data: input });
}

export function listPendingInvites() {
  return listPendingInvitesFn();
}

export function revokeInvite(id: string) {
  return revokeInviteFn({ data: id });
}

export function getInviteDetails(token: string) {
  return getInviteDetailsFn({ data: token });
}

export function acceptInvite(token: string, leaveExistingFamily = false) {
  return acceptInviteFn({ data: { token, leaveExistingFamily } });
}
