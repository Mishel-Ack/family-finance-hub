import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { assertCan, requireMember, requireSessionUser, type Role } from "@/lib/authz";
import type { Family, FamilyMember, Profile } from "@/types";
import {
  createFamilySchema,
  emptyInputSchema,
  familyRenameSchema,
  idSchema,
  memberAddSchema,
  memberRoleChangeSchema,
  ownDisplayNameSchema,
  profileNameSchema,
  transferOwnershipSchema,
} from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";
import { assertSameOrigin } from "@/lib/http-utils";
import { DEFAULT_CATEGORIES } from "@/lib/default-categories";
import {
  groupSharedActivityByMember,
  privateExpensesForMemberWhere,
  sharedExpensesWhere,
} from "@/lib/expense-queries";
import { recordActivity } from "@/lib/activity-queries";
import { assertMemberSettled } from "@/services/balances";

export const getProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  return auth.user as Profile;
});

export const updateProfileNameFn = createServerFn({ method: "POST" })
  .validator(profileNameSchema)
  .handler(async ({ data: name }) => {
    assertSameOrigin();
    const auth = await requireMember("family:rename");
    await prisma.user.update({ where: { id: auth.userId }, data: { name: name.trim() } });
  });

export const updateOwnDisplayNameFn = createServerFn({ method: "POST" })
  .validator(ownDisplayNameSchema)
  .handler(async ({ data: displayName }) => {
    assertSameOrigin();
    const auth = await requireMember("member:updateDisplayName");
    const updated = await prisma.familyMember.updateMany({
      where: { id: auth.memberId, familyId: auth.familyId, userId: auth.userId },
      data: { displayName },
    });
    if (!updated.count) throw notFound("Family member not found");
  });

export const getMembershipFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  const member = await prisma.familyMember.findFirst({
    where: { familyId: auth.familyId, userId: auth.userId },
    include: { family: true },
  });
  if (!member?.family) return null;
  const familyObj: Family = {
    id: member.family.id,
    name: member.family.name,
    owner_id: member.family.ownerId,
    created_at: member.family.createdAt.toISOString(),
    updated_at: member.family.updatedAt.toISOString(),
  };
  const memberObj: FamilyMember = {
    id: member.id,
    family_id: member.familyId,
    user_id: member.userId,
    display_name: member.displayName,
    role: member.role,
    created_at: member.createdAt.toISOString(),
  };
  return { membership: memberObj, family: familyObj };
});

export const listFamilyMembersFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  const [members, activities] = await Promise.all([
    prisma.familyMember.findMany({
      where: { familyId: auth.familyId, formerAt: null },
      orderBy: { createdAt: "asc" },
    }),
    groupSharedActivityByMember(prisma, auth.familyId),
  ]);
  const lastActivity = new Map(
    activities.flatMap((item) =>
      item.memberId ? [[item.memberId, item._max.updatedAt?.toISOString() ?? null] as const] : [],
    ),
  );
  return members.map((member) => ({
    id: member.id,
    family_id: member.familyId,
    user_id: member.userId,
    display_name: member.displayName,
    role: member.role,
    created_at: member.createdAt.toISOString(),
    last_activity_at: lastActivity.get(member.id) ?? null,
    is_you: member.userId === auth.userId,
  }));
});

export const addFamilyMemberFn = createServerFn({ method: "POST" })
  .validator(memberAddSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:add");
    if (data.role === "ADMIN") assertCan(auth.role, "member:assignAdminRole");
    await prisma.$transaction(async (tx) => {
      const member = await tx.familyMember.create({
        data: { familyId: auth.familyId, displayName: data.displayName, role: data.role },
      });
      await recordActivity(tx, auth, {
        type: "MEMBER_JOINED",
        entityType: "MEMBER",
        entityId: member.id,
        summary: { displayName: member.displayName.slice(0, 80), role: member.role },
      });
    });
  });

export const removeFamilyMemberFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("member:remove");
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.familyMember.findFirst({
          where: { id, familyId: auth.familyId, formerAt: null },
        });
        if (!target) throw notFound("Family member not found");
        if (target.id === auth.memberId)
          throw httpError("Use Leave family to remove yourself", 403);
        if (target.role === "OWNER") assertCan(auth.role, "member:removeOwner");
        if (target.role === "ADMIN") assertCan(auth.role, "member:removeAdmin");
        await assertMemberSettled(tx, auth.familyId, target.id);
        await recordActivity(tx, auth, {
          type: "MEMBER_REMOVED",
          entityType: "MEMBER",
          entityId: target.id,
          summary: { displayName: target.displayName.slice(0, 80), role: target.role },
        });
        await tx.expense.deleteMany({
          where: privateExpensesForMemberWhere(auth.familyId, target.id),
        });
        await tx.expense.updateMany({
          where: sharedExpensesWhere(auth.familyId, { memberId: target.id }),
          data: { memberNameSnapshot: target.displayName, memberIdSnapshot: target.id },
        });
        const detached = await tx.familyMember.updateMany({
          where: { id: target.id, familyId: auth.familyId, role: target.role, formerAt: null },
          data: { formerAt: new Date(), userId: null },
        });
        if (!detached.count) throw httpError("Member changed while removing; try again", 409);
      },
      { isolationLevel: "Serializable" },
    );
  });

export const changeFamilyMemberRoleFn = createServerFn({ method: "POST" })
  .validator(memberRoleChangeSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:changeMemberRole");
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.familyMember.findFirst({
          where: { id: data.id, familyId: auth.familyId, formerAt: null },
        });
        if (!target) throw notFound("Family member not found");
        if (target.id === auth.memberId && target.role === "OWNER") {
          const owners = await tx.familyMember.count({
            where: { familyId: auth.familyId, role: "OWNER", formerAt: null },
          });
          if (owners === 1) throw httpError("Transfer ownership before changing your role", 409);
        }
        if (target.role === "OWNER") assertCan(auth.role, "member:changeOwnerRole");
        if (target.role === "ADMIN") assertCan(auth.role, "member:changeAdminRole");
        if (data.role === "ADMIN") assertCan(auth.role, "member:assignAdminRole");
        const result = await tx.familyMember.updateMany({
          where: { id: target.id, familyId: auth.familyId, role: target.role },
          data: { role: data.role },
        });
        if (!result.count) throw httpError("Member changed while updating; try again", 409);
        await recordActivity(tx, auth, {
          type: "MEMBER_ROLE_CHANGED",
          entityType: "MEMBER",
          entityId: target.id,
          summary: {
            displayName: target.displayName.slice(0, 80),
            oldRole: target.role,
            newRole: data.role,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  });

export const leaveFamilyFn = createServerFn({ method: "POST" })
  .validator(emptyInputSchema)
  .handler(async () => {
    assertSameOrigin();
    const auth = await requireMember("member:leave");
    await prisma.$transaction(
      async (tx) => {
        const member = await tx.familyMember.findFirst({
          where: { id: auth.memberId, familyId: auth.familyId, formerAt: null },
        });
        if (!member) throw notFound("Family member not found");
        if (member.role === "OWNER") {
          const ownerCount = await tx.familyMember.count({
            where: { familyId: auth.familyId, role: "OWNER", formerAt: null },
          });
          if (ownerCount <= 1)
            throw httpError("The sole OWNER must transfer ownership before leaving", 409);
        }
        await assertMemberSettled(tx, auth.familyId, member.id);
        await recordActivity(tx, auth, {
          type: "MEMBER_LEFT",
          entityType: "MEMBER",
          entityId: member.id,
          summary: { displayName: member.displayName.slice(0, 80) },
        });
        await tx.expense.deleteMany({
          where: privateExpensesForMemberWhere(auth.familyId, member.id),
        });
        await tx.expense.updateMany({
          where: sharedExpensesWhere(auth.familyId, { memberId: member.id }),
          data: { memberNameSnapshot: member.displayName, memberIdSnapshot: member.id },
        });
        const detached = await tx.familyMember.updateMany({
          where: { id: member.id, familyId: auth.familyId, role: member.role, formerAt: null },
          data: { formerAt: new Date(), userId: null },
        });
        if (!detached.count) throw notFound("Family member not found");
      },
      { isolationLevel: "Serializable" },
    );
  });

export const transferOwnershipFn = createServerFn({ method: "POST" })
  .validator(transferOwnershipSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:transferOwnership");
    await prisma.$transaction(async (tx) => {
      const [family, target] = await Promise.all([
        tx.family.findUnique({
          where: { id: auth.familyId },
          select: { name: true, ownerId: true },
        }),
        tx.familyMember.findFirst({
          where: { id: data.targetMemberId, familyId: auth.familyId, formerAt: null },
        }),
      ]);
      if (!target) throw notFound("Family member not found");
      if (!family || family.name !== data.familyNameConfirmation)
        throw httpError("Family name confirmation does not match", 400);
      if (!target.userId || target.id === auth.memberId)
        throw httpError("Choose another linked family account", 400);
      const oldOwner = await tx.familyMember.findFirst({
        where: { id: auth.memberId, familyId: auth.familyId },
        select: { displayName: true },
      });
      if (!oldOwner) throw notFound("Family member not found");
      const claimed = await tx.family.updateMany({
        where: { id: auth.familyId, ownerId: auth.userId },
        data: { ownerId: target.userId },
      });
      if (!claimed.count)
        throw httpError("Ownership has already changed; refresh and try again", 409);
      const demoted = await tx.familyMember.updateMany({
        where: { id: auth.memberId, familyId: auth.familyId, role: "OWNER" },
        data: { role: "ADMIN" },
      });
      const promoted = await tx.familyMember.updateMany({
        where: { id: target.id, familyId: auth.familyId, role: target.role },
        data: { role: "OWNER" },
      });
      if (demoted.count !== 1 || promoted.count !== 1)
        throw httpError("Membership changed during transfer", 409);
      await recordActivity(tx, auth, {
        type: "OWNERSHIP_TRANSFERRED",
        entityType: "FAMILY",
        entityId: auth.familyId,
        summary: {
          oldOwnerName: oldOwner.displayName.slice(0, 80),
          newOwnerName: target.displayName.slice(0, 80),
        },
      });
    });
  });

export const createFamilyFn = createServerFn({ method: "POST" })
  .validator(createFamilySchema)
  .handler(async ({ data: familyName }) => {
    assertSameOrigin();
    const session = await requireSessionUser();
    if (session.membership) assertCan(session.membership.role, "family:create");
    await prisma.$transaction(async (tx) => {
      if (await tx.familyMember.findUnique({ where: { userId: session.userId } })) {
        throw httpError("This account already belongs to a family", 409);
      }
      const family = await tx.family.create({
        data: { name: familyName, ownerId: session.userId },
      });
      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId: session.userId,
          displayName: session.user.name,
          role: "OWNER",
        },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({
          ...category,
          familyId: family.id,
          isDefault: true,
        })),
      });
    });
  });

export const renameFamilyFn = createServerFn({ method: "POST" })
  .validator(familyRenameSchema)
  .handler(async ({ data: name }) => {
    assertSameOrigin();
    const auth = await requireMember("family:rename");
    await prisma.family.update({ where: { id: auth.familyId }, data: { name } });
  });

export function getProfile() {
  return getProfileFn();
}
export function updateProfileName(name: string) {
  return updateProfileNameFn({ data: name });
}
export function updateOwnDisplayName(name: string) {
  return updateOwnDisplayNameFn({ data: name });
}
export function getMembership() {
  return getMembershipFn();
}
export function listFamilyMembers() {
  return listFamilyMembersFn();
}
export function addFamilyMember(displayName: string, role: Exclude<Role, "OWNER">) {
  return addFamilyMemberFn({ data: { displayName, role } });
}
export function removeFamilyMember(id: string) {
  return removeFamilyMemberFn({ data: id });
}
export function changeFamilyMemberRole(id: string, role: Exclude<Role, "OWNER">) {
  return changeFamilyMemberRoleFn({ data: { id, role } });
}
export function leaveFamily() {
  return leaveFamilyFn({ data: undefined });
}
export function transferOwnership(targetMemberId: string, familyNameConfirmation: string) {
  return transferOwnershipFn({ data: { targetMemberId, familyNameConfirmation } });
}
export function createFamily(name: string) {
  return createFamilyFn({ data: name });
}
export function renameFamily(name: string) {
  return renameFamilyFn({ data: name });
}
