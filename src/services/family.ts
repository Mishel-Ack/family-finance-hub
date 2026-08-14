import { prisma } from "@/lib/prisma";
import type { Family, FamilyMember, Profile } from "@/types";

export async function bootstrapUser(userId: string, name: string, email: string) {
  // Ensure profile / user exists in db
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: userId,
        name: name || "Member",
        email: email || "",
        passwordHash: "",
      },
    });
  }

  const existingMember = await prisma.familyMember.findFirst({
    where: { userId },
  });

  if (!existingMember) {
    const family = await prisma.family.create({
      data: {
        name: `${name || "My"}'s Family`,
        ownerId: userId,
      },
    });

    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId,
        displayName: name || "Member",
        role: "OWNER",
      },
    });
  }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

export async function updateProfileName(userId: string, name: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { name },
  });
}

export async function getMembership(userId: string) {
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
}

export async function listFamilyMembers(familyId: string): Promise<FamilyMember[]> {
  const members = await prisma.familyMember.findMany({
    where: { familyId },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    family_id: m.familyId,
    user_id: m.userId,
    display_name: m.displayName,
    role: m.role as any,
    created_at: m.createdAt.toISOString(),
  }));
}

export async function addFamilyMember(familyId: string, displayName: string, role: string) {
  await prisma.familyMember.create({
    data: {
      familyId,
      displayName,
      role,
    },
  });
}

export async function removeFamilyMember(id: string) {
  await prisma.familyMember.delete({ where: { id } });
}

export async function renameFamily(familyId: string, name: string) {
  await prisma.family.update({
    where: { id: familyId },
    data: { name },
  });
}