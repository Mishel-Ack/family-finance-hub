import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import type { Family, FamilyMember, Profile } from "@/types";

export const bootstrapUserFn = createServerFn({ method: "POST" })
  .validator((d: { userId: string; name: string; email: string }) => d)
  .handler(async ({ data }) => {
    let user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: data.userId,
          name: data.name || "Member",
          email: data.email || "",
          passwordHash: "",
        },
      });
    }

    const existingMember = await prisma.familyMember.findFirst({
      where: { userId: data.userId },
    });

    if (!existingMember) {
      const family = await prisma.family.create({
        data: {
          name: `${data.name || "My"}'s Family`,
          ownerId: data.userId,
        },
      });

      await prisma.familyMember.create({
        data: {
          familyId: family.id,
          userId: data.userId,
          displayName: data.name || "Member",
          role: "OWNER",
        },
      });
    }
  });

export const getProfileFn = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    return user ? ({ id: user.id, name: user.name, email: user.email } as Profile) : null;
  });

export const updateProfileNameFn = createServerFn({ method: "POST" })
  .validator((d: { userId: string; name: string }) => d)
  .handler(async ({ data }) => {
    await prisma.user.update({
      where: { id: data.userId },
      data: { name: data.name },
    });
  });

export const getMembershipFn = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const member = await prisma.familyMember.findFirst({
      where: { userId },
      include: {
        family: true,
      },
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
      role: member.role as any,
      created_at: member.createdAt.toISOString(),
    };

    return { membership: memberObj, family: familyObj };
  });

export const listFamilyMembersFn = createServerFn({ method: "GET" })
  .validator((familyId: string) => familyId)
  .handler(async ({ data: familyId }) => {
    const members = await prisma.familyMember.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });

    return members.map(
      (m) =>
        ({
          id: m.id,
          family_id: m.familyId,
          user_id: m.userId,
          display_name: m.displayName,
          role: m.role as any,
          created_at: m.createdAt.toISOString(),
        }) as FamilyMember,
    );
  });

export const addFamilyMemberFn = createServerFn({ method: "POST" })
  .validator((d: { familyId: string; displayName: string; role: string }) => d)
  .handler(async ({ data }) => {
    await prisma.familyMember.create({
      data: {
        familyId: data.familyId,
        displayName: data.displayName,
        role: data.role,
      },
    });
  });

export const removeFamilyMemberFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await prisma.familyMember.delete({ where: { id } });
  });

export const renameFamilyFn = createServerFn({ method: "POST" })
  .validator((d: { familyId: string; name: string }) => d)
  .handler(async ({ data }) => {
    await prisma.family.update({
      where: { id: data.familyId },
      data: { name: data.name },
    });
  });

// Client helpers that invoke server functions
export function bootstrapUser(userId: string, name: string, email: string) {
  return bootstrapUserFn({ data: { userId, name, email } });
}

export function getProfile(userId: string) {
  return getProfileFn({ data: userId });
}

export function updateProfileName(userId: string, name: string) {
  return updateProfileNameFn({ data: { userId, name } });
}

export function getMembership(userId: string) {
  return getMembershipFn({ data: userId });
}

export function listFamilyMembers(familyId: string) {
  return listFamilyMembersFn({ data: familyId });
}

export function addFamilyMember(familyId: string, displayName: string, role: string) {
  return addFamilyMemberFn({ data: { familyId, displayName, role } });
}

export function removeFamilyMember(id: string) {
  return removeFamilyMemberFn({ data: id });
}

export function renameFamily(familyId: string, name: string) {
  return renameFamilyFn({ data: { familyId, name } });
}