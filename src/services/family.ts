import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember, assertCan, Role } from "@/lib/authz";
import type { Family, FamilyMember, Profile } from "@/types";
import {
  familyRenameSchema,
  idSchema,
  memberAddSchema,
  memberRoleChangeSchema,
  profileNameSchema,
} from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";
import { assertSameOrigin } from "@/lib/http-utils";

export const getProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  return auth.user as Profile;
});

export const updateProfileNameFn = createServerFn({ method: "POST" })
  .validator(profileNameSchema)
  .handler(async ({ data: name }) => {
    assertSameOrigin();
    const auth = await requireMember("family:rename");

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new Error("Name must be at least 2 characters");
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { name: trimmed },
    });
  });

export const getMembershipFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");

  const member = await prisma.familyMember.findFirst({
    where: { familyId: auth.familyId, userId: auth.userId },
    include: { family: true },
  });

  if (!member || !member.family) return null;

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

  const members = await prisma.familyMember.findMany({
    where: { familyId: auth.familyId },
    orderBy: { createdAt: "asc" },
  });

  return members.map(
    (m) =>
      ({
        id: m.id,
        family_id: m.familyId,
        user_id: m.userId,
        display_name: m.displayName,
        role: m.role,
        created_at: m.createdAt.toISOString(),
      }) as FamilyMember,
  );
});

export const addFamilyMemberFn = createServerFn({ method: "POST" })
  .validator(memberAddSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:add");

    if (data.role === "OWNER") assertCan(auth.role, "member:changeRole");

    const displayName = data.displayName.trim();
    if (displayName.length < 2) {
      throw new Error("Member display name must be at least 2 characters");
    }

    await prisma.familyMember.create({
      data: {
        familyId: auth.familyId,
        displayName,
        role: data.role,
      },
    });
  });

export const removeFamilyMemberFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("member:remove");

    const target = await prisma.familyMember.findFirst({
      where: { id, familyId: auth.familyId },
    });

    if (!target) {
      throw notFound("Family member not found");
    }

    if (target.role === "OWNER") {
      throw httpError("The family OWNER cannot be removed", 403);
    }

    const deleted = await prisma.familyMember.deleteMany({
      where: { id, familyId: auth.familyId, role: { not: "OWNER" } },
    });
    if (deleted.count === 0) {
      const current = await prisma.familyMember.findFirst({
        where: { id, familyId: auth.familyId },
      });
      if (!current) throw notFound("Family member not found");
      throw httpError("The family OWNER cannot be removed", 403);
    }
  });

export const changeFamilyMemberRoleFn = createServerFn({ method: "POST" })
  .validator(memberRoleChangeSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("member:changeRole");
    const updated = await prisma.familyMember.updateMany({
      where: { id: data.id, familyId: auth.familyId },
      data: { role: data.role },
    });
    if (updated.count === 0) throw notFound("Family member not found");
  });

export const renameFamilyFn = createServerFn({ method: "POST" })
  .validator(familyRenameSchema)
  .handler(async ({ data: name }) => {
    assertSameOrigin();
    const auth = await requireMember("family:rename");

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new Error("Family name must be at least 2 characters");
    }

    await prisma.family.update({
      where: { id: auth.familyId },
      data: { name: trimmed },
    });
  });

// Client helpers
export function getProfile() {
  return getProfileFn();
}

export function updateProfileName(name: string) {
  return updateProfileNameFn({ data: name });
}

export function getMembership() {
  return getMembershipFn();
}

export function listFamilyMembers() {
  return listFamilyMembersFn();
}

export function addFamilyMember(displayName: string, role: Role) {
  return addFamilyMemberFn({ data: { displayName, role } });
}

export function removeFamilyMember(id: string) {
  return removeFamilyMemberFn({ data: id });
}

export function changeFamilyMemberRole(id: string, role: Role) {
  return changeFamilyMemberRoleFn({ data: { id, role } });
}

export function renameFamily(name: string) {
  return renameFamilyFn({ data: name });
}
