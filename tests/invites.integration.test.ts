import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parseInput = (input: unknown) => input;
    const builder = {
      validator(schema: { parse: (input: unknown) => unknown }) {
        parseInput = (input: unknown) => schema.parse(input);
        return builder;
      },
      handler(handler: (options: { data: unknown }) => unknown) {
        return (options?: { data?: unknown }) =>
          Promise.resolve(parseInput(options?.data)).then((data) => handler({ data }));
      },
    };
    return builder;
  },
}));

import { prisma } from "@/lib/prisma";
import { resetInviteRateLimitForTests, hashInviteToken } from "@/lib/invite-acceptance";
import { setAuthResolverForTests, type AuthContext, type Role } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import { configureAuthTests, registerWithInviteFn } from "@/services/auth.server";
import {
  acceptInviteFn,
  createInviteFn,
  getInviteDetailsFn,
  listPendingInvitesFn,
  revokeInviteFn,
} from "@/services/invites";
import type { User, FamilyMember } from "@prisma/client";

let ownerUser: User;
let ownerMember: FamilyMember;
let familyId: string;
let currentAuth: AuthContext | null = null;

async function makeUser(name: string, email: string) {
  return prisma.user.create({ data: { name, email, passwordHash: "test-hash" } });
}

async function makeFamilyOwner() {
  ownerUser = await makeUser("Invite Owner", "invite-owner@example.test");
  const family = await prisma.family.create({
    data: { name: "Invite Household", ownerId: ownerUser.id },
  });
  familyId = family.id;
  ownerMember = await prisma.familyMember.create({
    data: {
      familyId,
      userId: ownerUser.id,
      displayName: ownerUser.name,
      role: "OWNER",
    },
  });
  setAuth(ownerUser, ownerMember, familyId, "OWNER");
}

function setAuth(user: User, member: FamilyMember, targetFamilyId: string, role: Role) {
  currentAuth = {
    userId: user.id,
    familyId: targetFamilyId,
    memberId: member.id,
    role,
    user: { id: user.id, name: user.name, email: user.email },
  };
  setAuthResolverForTests(async () => currentAuth);
}

async function wipe() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Invite", "Expense", "BudgetCategory", "Budget", "Category", "FamilyMember", "Family", "User" CASCADE',
  );
}

function inviteToken(link: string) {
  return new URL(link).pathname.split("/").at(-1)!;
}

beforeEach(async () => {
  await wipe();
  process.env["APP_ORIGIN"] = "http://familybudget.test";
  setHeadersForTests({
    host: "familybudget.test",
    origin: "http://familybudget.test",
    "x-forwarded-for": "198.51.100.42",
  });
  configureAuthTests({ cookieHandler: () => undefined });
  resetInviteRateLimitForTests();
  await makeFamilyOwner();
});

afterEach(async () => {
  currentAuth = null;
  setAuthResolverForTests(undefined);
  setHeadersForTests(undefined);
  configureAuthTests({});
  resetInviteRateLimitForTests();
  await wipe();
});

afterAll(async () => prisma.$disconnect());

describe("family invite flow", () => {
  it("creates hashed single-use links and enforces owner/admin invite roles", async () => {
    const adminInvite = await createInviteFn({ data: { role: "ADMIN" } });
    expect(adminInvite.link).toMatch(/^http:\/\/familybudget\.test\/join\//);
    const adminToken = inviteToken(adminInvite.link);
    const storedAdminInvite = await prisma.invite.findUnique({ where: { id: adminInvite.id } });
    expect(storedAdminInvite?.tokenHash).toBe(hashInviteToken(adminToken));
    expect(storedAdminInvite?.tokenHash).not.toContain(adminToken);
    await expect(getInviteDetailsFn({ data: adminToken })).resolves.toMatchObject({
      familyName: "Invite Household",
      role: "ADMIN",
    });

    const adminUser = await makeUser("Invite Admin", "invite-admin@example.test");
    const adminMember = await prisma.familyMember.create({
      data: { familyId, userId: adminUser.id, displayName: adminUser.name, role: "ADMIN" },
    });
    setAuth(adminUser, adminMember, familyId, "ADMIN");
    await expect(createInviteFn({ data: { role: "ADMIN" } })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(createInviteFn({ data: { role: "VIEWER" } })).resolves.toMatchObject({
      role: "VIEWER",
    });

    const viewerUser = await makeUser("Invite Viewer", "invite-viewer@example.test");
    const viewerMember = await prisma.familyMember.create({
      data: { familyId, userId: viewerUser.id, displayName: viewerUser.name, role: "VIEWER" },
    });
    setAuth(viewerUser, viewerMember, familyId, "VIEWER");
    await expect(createInviteFn({ data: { role: "MEMBER" } })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("revokes links and gives one existing solo owner an atomic leave-and-join path", async () => {
    const invite = await createInviteFn({ data: { role: "MEMBER" } });
    const token = inviteToken(invite.link);
    const pending = await listPendingInvitesFn();
    expect(pending).toHaveLength(1);
    await revokeInviteFn({ data: invite.id });
    await expect(getInviteDetailsFn({ data: token })).rejects.toMatchObject({ statusCode: 404 });
    await expect(listPendingInvitesFn()).resolves.toHaveLength(0);

    const secondInvite = await createInviteFn({ data: { role: "MEMBER" } });
    const secondToken = inviteToken(secondInvite.link);
    const soloUser = await makeUser("Solo Owner", "solo-owner@example.test");
    const soloFamily = await prisma.family.create({
      data: { name: "Empty Solo Home", ownerId: soloUser.id },
    });
    const soloMember = await prisma.familyMember.create({
      data: {
        familyId: soloFamily.id,
        userId: soloUser.id,
        displayName: soloUser.name,
        role: "OWNER",
      },
    });
    setAuth(soloUser, soloMember, soloFamily.id, "OWNER");
    await expect(acceptInviteFn({ data: { token: secondToken } })).rejects.toThrow(
      "Confirm that you want to leave it and join this family",
    );
    expect(await prisma.invite.findUnique({ where: { id: secondInvite.id } })).toMatchObject({
      usedAt: null,
    });
    await expect(
      acceptInviteFn({ data: { token: secondToken, leaveExistingFamily: true } }),
    ).resolves.toMatchObject({ familyId, role: "MEMBER" });
    expect(await prisma.family.findUnique({ where: { id: soloFamily.id } })).toBeNull();
    expect(await prisma.familyMember.count({ where: { userId: soloUser.id } })).toBe(1);

    setAuth(ownerUser, ownerMember, familyId, "OWNER");
    const occupiedInvite = await createInviteFn({ data: { role: "MEMBER" } });
    const occupiedToken = inviteToken(occupiedInvite.link);
    const occupiedUser = await makeUser("Occupied Owner", "occupied-owner@example.test");
    const occupiedFamily = await prisma.family.create({
      data: { name: "Active Household", ownerId: occupiedUser.id },
    });
    const occupiedMember = await prisma.familyMember.create({
      data: {
        familyId: occupiedFamily.id,
        userId: occupiedUser.id,
        displayName: occupiedUser.name,
        role: "OWNER",
      },
    });
    await prisma.budget.create({
      data: { familyId: occupiedFamily.id, month: 1, year: 2026, totalLimitPaise: 10000 },
    });
    setAuth(occupiedUser, occupiedMember, occupiedFamily.id, "OWNER");
    await expect(
      acceptInviteFn({ data: { token: occupiedToken, leaveExistingFamily: true } }),
    ).rejects.toThrow("already belongs to a family with other members or financial activity");
    expect(await prisma.family.findUnique({ where: { id: occupiedFamily.id } })).not.toBeNull();
    expect(await prisma.invite.findUnique({ where: { id: occupiedInvite.id } })).toMatchObject({
      usedAt: null,
    });

    const privateOnlyUser = await makeUser("Private-only Owner", "private-only-owner@example.test");
    const privateOnlyFamily = await prisma.family.create({
      data: { name: "Private Activity Home", ownerId: privateOnlyUser.id },
    });
    const privateOnlyMember = await prisma.familyMember.create({
      data: {
        familyId: privateOnlyFamily.id,
        userId: privateOnlyUser.id,
        displayName: privateOnlyUser.name,
        role: "OWNER",
      },
    });
    const privateOnlyCategory = await prisma.category.create({
      data: { familyId: privateOnlyFamily.id, name: "Personal", isDefault: true },
    });
    await prisma.expense.create({
      data: {
        familyId: privateOnlyFamily.id,
        userId: privateOnlyUser.id,
        memberId: privateOnlyMember.id,
        categoryId: privateOnlyCategory.id,
        amountPaise: 100,
        visibility: "PRIVATE",
      },
    });
    setAuth(privateOnlyUser, privateOnlyMember, privateOnlyFamily.id, "OWNER");
    await expect(
      acceptInviteFn({ data: { token: occupiedToken, leaveExistingFamily: true } }),
    ).rejects.toThrow("already belongs to a family with other members or financial activity");
    expect(await prisma.family.findUnique({ where: { id: privateOnlyFamily.id } })).not.toBeNull();
    expect(await prisma.invite.findUnique({ where: { id: occupiedInvite.id } })).toMatchObject({
      usedAt: null,
    });
  });

  it("registers directly into the invited family and checks invite email", async () => {
    const invite = await createInviteFn({
      data: { role: "VIEWER", email: "new-joiner@example.test" },
    });
    const token = inviteToken(invite.link);
    await expect(
      registerWithInviteFn({
        data: {
          name: "Wrong Email",
          email: "wrong@example.test",
          password: "strong-password",
          token,
        },
      }),
    ).rejects.toThrow("different email address");
    expect(await prisma.user.findUnique({ where: { email: "wrong@example.test" } })).toBeNull();

    await registerWithInviteFn({
      data: {
        name: "New Joiner",
        email: "NEW-JOINER@example.test",
        password: "strong-password",
        token,
      },
    });
    const newUser = await prisma.user.findUnique({ where: { email: "new-joiner@example.test" } });
    expect(newUser).not.toBeNull();
    expect(await prisma.family.count()).toBe(1);
    expect(await prisma.familyMember.findUnique({ where: { userId: newUser!.id } })).toMatchObject({
      familyId,
      role: "VIEWER",
    });
  });

  it("makes acceptance single-use under concurrent requests and rate-limits failures", async () => {
    const invite = await createInviteFn({ data: { role: "MEMBER" } });
    const token = inviteToken(invite.link);
    const joiningUser = await makeUser("Race Joiner", "race-joiner@example.test");
    const detachedMember = {
      id: "00000000-0000-4000-8000-000000000001",
      familyId,
      userId: joiningUser.id,
      displayName: joiningUser.name,
      role: "MEMBER" as const,
      createdAt: new Date(),
    };
    setAuth(joiningUser, detachedMember as FamilyMember, familyId, "MEMBER");
    const outcomes = await Promise.allSettled([
      acceptInviteFn({ data: { token } }),
      acceptInviteFn({ data: { token } }),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await prisma.familyMember.count({ where: { userId: joiningUser.id } })).toBe(1);
    await expect(getInviteDetailsFn({ data: token })).rejects.toMatchObject({ statusCode: 404 });

    setAuth(ownerUser, ownerMember, familyId, "OWNER");
    const expiredInvite = await createInviteFn({ data: { role: "MEMBER" } });
    const expiredToken = inviteToken(expiredInvite.link);
    await prisma.invite.update({
      where: { id: expiredInvite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(getInviteDetailsFn({ data: expiredToken })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(acceptInviteFn({ data: { token: expiredToken } })).rejects.toMatchObject({
      statusCode: 404,
    });

    resetInviteRateLimitForTests();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(acceptInviteFn({ data: { token: "a".repeat(43) } })).rejects.toMatchObject({
        statusCode: 404,
      });
    }
    await expect(acceptInviteFn({ data: { token: "a".repeat(43) } })).rejects.toMatchObject({
      statusCode: 429,
    });
  });
});
