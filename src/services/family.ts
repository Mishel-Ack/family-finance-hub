import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember, assertCan, Role } from "@/lib/authz";
import type { Family, FamilyMember, Profile } from "@/types";
import { z } from "zod";
import { httpError, notFound } from "@/lib/http-error";

export const getProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireMember("readAll");
  return auth.user as Profile;
});

export const updateProfileNameFn = createServerFn({ method: "POST" })
  .validator((name: string) => name)
  .handler(async ({ data: name }) => {
    const auth = await requireMember();

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
  .validator(
    z.object({
      displayName: z.string().trim().min(2).max(80),
      role: z.enum(["ADMIN", "MEMBER", "VIEWER", "OWNER"]),
    }),
  )
  .handler(async ({ data }) => {
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
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
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

    await prisma.familyMember.delete({ where: { id } });
  });

export const renameFamilyFn = createServerFn({ method: "POST" })
  .validator((name: string) => name)
  .handler(async ({ data: name }) => {
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

export function renameFamily(name: string) {
  return renameFamilyFn({ data: name });
}
