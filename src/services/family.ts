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
      where: { familyId: auth.familyId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.groupBy({
      by: ["memberId"],
      where: { familyId: auth.familyId, memberId: { not: null } },
      _max: { updatedAt: true },
    }),
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
    await prisma.familyMember.create({
      data: { familyId: auth.familyId, displayName: data.displayName, role: data.role },
    });
  });

export const removeFamilyMemberFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("member:remove");
    await prisma.$transaction(async (tx) => {
      const target = await tx.familyMember.findFirst({ where: { id, familyId: auth.familyId } });
      if (!target) throw notFound("Family member not found");
      if (target.id === auth.memberId) throw httpError("Use Leave family to remove yourself", 403);
      if (target.role === "OWNER") assertCan(auth.role, "member:removeOwner");
      if (target.role === "ADMIN") assertCan(auth.role, "member:removeAdmin");
      await tx.expense.updateMany({
        where: { familyId: auth.familyId, memberId: target.id },
        data: { memberNameSnapshot: target.displayName },
      });
      // TODO(Phase 5): preserve splits and settlements before deleting a member.
      const deleted = await tx.familyMember.deleteMany({
        where: { id: target.id, familyId: auth.familyId, role: target.role },
      });
      if (!deleted.count) throw httpError("Member changed while removing; try again", 409);
    });
  });

export const changeFamilyMemberRoleFn = createServerFn({ method: "POST" })
  .validator(memberRoleChangeSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:changeMemberRole");
    const target = await prisma.familyMember.findFirst({
      where: { id: data.id, familyId: auth.familyId },
    });
    if (!target) throw notFound("Family member not found");
    if (target.id === auth.memberId && target.role === "OWNER") {
      const owners = await prisma.familyMember.count({
        where: { familyId: auth.familyId, role: "OWNER" },
      });
      if (owners === 1) throw httpError("Transfer ownership before changing your role", 409);
    }
    if (target.role === "OWNER") assertCan(auth.role, "member:changeOwnerRole");
    if (target.role === "ADMIN") assertCan(auth.role, "member:changeAdminRole");
    if (data.role === "ADMIN") assertCan(auth.role, "member:assignAdminRole");
    const result = await prisma.familyMember.updateMany({
      where: { id: target.id, familyId: auth.familyId, role: target.role },
      data: { role: data.role },
    });
    if (!result.count) throw httpError("Member changed while updating; try again", 409);
  });

export const leaveFamilyFn = createServerFn({ method: "POST" })
  .validator(emptyInputSchema)
  .handler(async () => {
    assertSameOrigin();
    const auth = await requireMember("member:leave");
    await prisma.$transaction(async (tx) => {
      const member = await tx.familyMember.findFirst({
        where: { id: auth.memberId, familyId: auth.familyId },
      });
      if (!member) throw notFound("Family member not found");
      await tx.expense.updateMany({
        where: { familyId: auth.familyId, memberId: member.id },
        data: { memberNameSnapshot: member.displayName },
      });
      // TODO(Phase 5): preserve splits and settlements before deleting a member.
      const removed = await tx.familyMember.deleteMany({
        where: { id: member.id, familyId: auth.familyId, role: member.role },
      });
      if (!removed.count) throw notFound("Family member not found");
    });
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
        tx.familyMember.findFirst({ where: { id: data.targetMemberId, familyId: auth.familyId } }),
      ]);
      if (!target) throw notFound("Family member not found");
      if (!family || family.name !== data.familyNameConfirmation)
        throw httpError("Family name confirmation does not match", 400);
      if (!target.userId || target.id === auth.memberId)
        throw httpError("Choose another linked family account", 400);
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
