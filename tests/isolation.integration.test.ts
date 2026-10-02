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
import { setAuthResolverForTests, type AuthContext, type Role } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import {
  createExpenseFn,
  deleteExpenseFn,
  listExpensesFn,
  updateExpenseFn,
} from "@/services/expense";
import {
  deleteBudgetCategoryFn,
  deleteBudgetFn,
  getBudgetFn,
  listBudgetCategoriesFn,
  upsertBudgetCategoryFn,
  upsertBudgetFn,
} from "@/services/budget";
import {
  archiveCategoryFn,
  createCategoryFn,
  deleteCategoryFn,
  listCategoriesFn,
} from "@/services/category";
import {
  addFamilyMemberFn,
  changeFamilyMemberRoleFn,
  getMembershipFn,
  getProfileFn,
  listFamilyMembersFn,
  removeFamilyMemberFn,
  renameFamilyFn,
  updateProfileNameFn,
} from "@/services/family";
import { getMonthlySummaryFn, getYearlyTrendFn } from "@/services/report";
import {
  configureAuthTests,
  loginFn,
  registerFn,
  resetLoginRateLimitForTests,
} from "@/services/auth.server";
import type { FamilyMember, User } from "@prisma/client";

interface FixtureMember {
  user: User;
  member: FamilyMember;
}

interface FamilyFixture {
  familyId: string;
  owner: FixtureMember;
  admin?: FixtureMember;
  member?: FixtureMember;
  viewer?: FixtureMember;
  categoryId: string;
  budgetId: string;
  expenseId: string;
  adminExpenseId?: string;
}

let familyA: FamilyFixture;
let familyB: FamilyFixture;
let currentAuth: AuthContext | null = null;

function selectAuth(context: AuthContext | null) {
  currentAuth = context;
  setAuthResolverForTests(async () => currentAuth);
}

async function createUser(name: string, email: string): Promise<User> {
  return prisma.user.create({ data: { name, email, passwordHash: "unused-test-hash" } });
}

async function createFamily(label: string, withRoles: boolean): Promise<FamilyFixture> {
  const ownerUser = await createUser(`${label} owner`, `${label.toLowerCase()}-owner@example.test`);
  const family = await prisma.family.create({
    data: { name: `${label} household`, ownerId: ownerUser.id },
  });
  const ownerMember = await prisma.familyMember.create({
    data: { familyId: family.id, userId: ownerUser.id, displayName: ownerUser.name, role: "OWNER" },
  });
  const owner = { user: ownerUser, member: ownerMember };
  const createRoleMember = async (role: Role, shortName: string): Promise<FixtureMember> => {
    const user = await createUser(
      `${label} ${shortName}`,
      `${label.toLowerCase()}-${shortName}@example.test`,
    );
    const member = await prisma.familyMember.create({
      data: { familyId: family.id, userId: user.id, displayName: user.name, role },
    });
    return { user, member };
  };
  const admin = withRoles ? await createRoleMember("ADMIN", "admin") : undefined;
  const member = withRoles ? await createRoleMember("MEMBER", "member") : undefined;
  const viewer = withRoles ? await createRoleMember("VIEWER", "viewer") : undefined;
  const category = await prisma.category.create({
    data: { familyId: family.id, name: `${label} confidential`, color: "#336699", isDefault: true },
  });
  const budget = await prisma.budget.create({
    data: { familyId: family.id, month: 9, year: 2026, totalLimitPaise: 500_000 },
  });
  await prisma.budgetCategory.create({
    data: { budgetId: budget.id, categoryId: category.id, limitAmountPaise: 100_000 },
  });
  const expense = await prisma.expense.create({
    data: {
      familyId: family.id,
      userId: ownerUser.id,
      memberId: ownerMember.id,
      categoryId: category.id,
      amountPaise: 2500,
      date: new Date("2026-09-30T00:00:00.000Z"),
      description: `${label} private expense`,
    },
  });
  const adminExpense = admin
    ? await prisma.expense.create({
        data: {
          familyId: family.id,
          userId: admin.user.id,
          memberId: admin.member.id,
          categoryId: category.id,
          amountPaise: 4500,
          date: new Date("2026-09-30T00:00:00.000Z"),
          description: `${label} admin expense`,
        },
      })
    : undefined;
  return {
    familyId: family.id,
    owner,
    ...(admin ? { admin } : {}),
    ...(member ? { member } : {}),
    ...(viewer ? { viewer } : {}),
    categoryId: category.id,
    budgetId: budget.id,
    expenseId: expense.id,
    ...(adminExpense ? { adminExpenseId: adminExpense.id } : {}),
  };
}

function authFor(fixture: FamilyFixture, identity: FixtureMember, role: Role): AuthContext {
  return {
    userId: identity.user.id,
    familyId: fixture.familyId,
    memberId: identity.member.id,
    role,
    user: { id: identity.user.id, name: identity.user.name, email: identity.user.email },
  };
}

async function wipeTestDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Expense", "BudgetCategory", "Budget", "Category", "FamilyMember", "Family", "User" CASCADE',
  );
}

function expectStatus(error: unknown, statusCode: number) {
  expect(error).toMatchObject({ statusCode });
}

beforeEach(async () => {
  await wipeTestDatabase();
  familyA = await createFamily("Alpha", true);
  familyB = await createFamily("Beta", false);
  selectAuth(authFor(familyA, familyA.owner, "OWNER"));
  setHeadersForTests({
    "x-forwarded-for": "198.51.100.11",
    origin: "http://familybudget.test",
    host: "familybudget.test",
  });
  configureAuthTests({ cookieHandler: () => undefined });
  resetLoginRateLimitForTests();
});

afterEach(async () => {
  selectAuth(null);
  setAuthResolverForTests(undefined);
  setHeadersForTests(undefined);
  configureAuthTests({});
  resetLoginRateLimitForTests();
  await wipeTestDatabase();
});

afterAll(async () => prisma.$disconnect());

describe("PostgreSQL service isolation integration", () => {
  it("isolates expense, budget, report, category, and member reads and writes by family", async () => {
    selectAuth(authFor(familyB, familyB.owner, "OWNER"));
    const expenses = await listExpensesFn({ data: {} });
    expect(expenses.map(({ family_id }) => family_id)).toEqual([familyB.familyId]);
    await expect(deleteExpenseFn({ data: familyA.expenseId })).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await expect(
      updateExpenseFn({
        data: {
          id: familyA.expenseId,
          input: {
            amount: 20,
            categoryId: familyB.categoryId,
            date: "2026-09-30",
            description: "changed",
          },
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await expect(
      createExpenseFn({
        data: {
          amount: 20,
          categoryId: familyA.categoryId,
          memberId: familyB.owner.member.id,
          date: "2026-09-30",
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await expect(
      createExpenseFn({
        data: {
          amount: 20,
          categoryId: familyB.categoryId,
          memberId: familyA.owner.member.id,
          date: "2026-09-30",
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await expect(getBudgetFn({ data: { month: 9, year: 2026 } })).resolves.toMatchObject({
      family_id: familyB.familyId,
    });
    await expect(listBudgetCategoriesFn({ data: familyA.budgetId })).rejects.toSatisfy(
      (e: unknown) => {
        expectStatus(e, 404);
        return true;
      },
    );
    await expect(
      upsertBudgetCategoryFn({
        data: { budgetId: familyA.budgetId, categoryId: familyA.categoryId, limitAmount: 100 },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    const categories = await listCategoriesFn();
    expect(categories.map(({ family_id }) => family_id)).toEqual([familyB.familyId]);
    const members = await listFamilyMembersFn();
    expect(members.every(({ family_id }) => family_id === familyB.familyId)).toBe(true);
    const summary = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    expect(summary.expenses.every(({ family_id }) => family_id === familyB.familyId)).toBe(true);
    expect(summary.categories.map(({ category }) => category)).not.toContain("Alpha confidential");
    const trend = await getYearlyTrendFn({ data: 2026 });
    expect(trend).toHaveLength(12);
    await expect(deleteBudgetFn({ data: familyA.budgetId })).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await expect(
      deleteBudgetCategoryFn({ data: "00000000-0000-4000-8000-000000000001" }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
  });

  it("enforces VIEWER, MEMBER, and ADMIN expense and member permissions", async () => {
    const aMember = familyA.member!;
    const aAdmin = familyA.admin!;
    const aViewer = familyA.viewer!;
    const ownExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: aMember.user.id,
        memberId: aMember.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 500,
        date: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    selectAuth(authFor(familyA, aViewer, "VIEWER"));
    await expect(
      upsertBudgetFn({ data: { month: 9, year: 2026, totalLimit: 1000 } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(createCategoryFn({ data: { name: "Blocked" } })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      createExpenseFn({
        data: { amount: 1, categoryId: familyA.categoryId, date: "2026-09-01" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    const viewerWriteAttempts = [
      () => updateProfileNameFn({ data: "Blocked Name" }),
      () => renameFamilyFn({ data: "Blocked Family" }),
      () => addFamilyMemberFn({ data: { displayName: "Blocked Member", role: "MEMBER" } }),
      () => removeFamilyMemberFn({ data: aMember.member.id }),
      () => changeFamilyMemberRoleFn({ data: { id: aMember.member.id, role: "VIEWER" } }),
      () => archiveCategoryFn({ data: familyA.categoryId }),
      () => deleteBudgetFn({ data: familyA.budgetId }),
      () => deleteExpenseFn({ data: familyA.expenseId }),
    ];
    for (const attempt of viewerWriteAttempts) {
      await expect(attempt()).rejects.toMatchObject({ statusCode: 403 });
    }
    selectAuth(authFor(familyA, aMember, "MEMBER"));
    await expect(
      createExpenseFn({
        data: {
          amount: 1,
          categoryId: familyA.categoryId,
          memberId: aAdmin.member.id,
          date: "2026-09-01",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await updateExpenseFn({
      data: {
        id: ownExpense.id,
        input: {
          amount: 10,
          categoryId: familyA.categoryId,
          memberId: aMember.member.id,
          date: "2026-09-30",
        },
      },
    });
    await expect(
      updateExpenseFn({
        data: {
          id: familyA.adminExpenseId!,
          input: { amount: 11, categoryId: familyA.categoryId, date: "2026-09-30" },
        },
      }),
    ).rejects.toSatisfy((e: unknown) => {
      expectStatus(e, 404);
      return true;
    });
    await deleteExpenseFn({ data: ownExpense.id });
    selectAuth(authFor(familyA, aAdmin, "ADMIN"));
    await updateExpenseFn({
      data: {
        id: familyA.expenseId,
        input: { amount: 99, categoryId: familyA.categoryId, date: "2026-09-30" },
      },
    });
    await expect(
      changeFamilyMemberRoleFn({ data: { id: familyA.owner.member.id, role: "ADMIN" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(removeFamilyMemberFn({ data: familyA.owner.member.id })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("restricts hard deletion of used categories while archived expenses remain readable", async () => {
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await expect(deleteCategoryFn({ data: familyA.categoryId })).rejects.toThrow(
      "This category has expenses. Archive it instead.",
    );
    await archiveCategoryFn({ data: familyA.categoryId });
    expect((await listExpensesFn({ data: {} })).map(({ id }) => id)).toContain(familyA.expenseId);
    await expect(
      createExpenseFn({
        data: { amount: 5, categoryId: familyA.categoryId, date: "2026-09-30" },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const row = await prisma.expense.findUnique({ where: { id: familyA.expenseId } });
    expect(row?.categoryId).toBe(familyA.categoryId);
  });

  it("rejects unauthenticated access to every protected service handler", async () => {
    selectAuth(null);
    const invalidId = "00000000-0000-4000-8000-000000000001";
    const calls: Array<() => Promise<unknown>> = [
      () => listExpensesFn({ data: {} }),
      () => createExpenseFn({ data: { amount: 1, categoryId: invalidId, date: "2026-09-01" } }),
      () =>
        updateExpenseFn({
          data: {
            id: invalidId,
            input: { amount: 1, categoryId: invalidId, date: "2026-09-01" },
          },
        }),
      () => deleteExpenseFn({ data: invalidId }),
      () => getBudgetFn({ data: { month: 9, year: 2026 } }),
      () => upsertBudgetFn({ data: { month: 9, year: 2026, totalLimit: 100 } }),
      () => deleteBudgetFn({ data: invalidId }),
      () => listBudgetCategoriesFn({ data: invalidId }),
      () =>
        upsertBudgetCategoryFn({
          data: { budgetId: invalidId, categoryId: invalidId, limitAmount: 10 },
        }),
      () => deleteBudgetCategoryFn({ data: invalidId }),
      () => listCategoriesFn(),
      () => createCategoryFn({ data: { name: "Test" } }),
      () => archiveCategoryFn({ data: invalidId }),
      () => deleteCategoryFn({ data: invalidId }),
      () => getProfileFn(),
      () => updateProfileNameFn({ data: "New Name" }),
      () => getMembershipFn(),
      () => listFamilyMembersFn(),
      () => addFamilyMemberFn({ data: { displayName: "Someone", role: "MEMBER" } }),
      () => removeFamilyMemberFn({ data: invalidId }),
      () => changeFamilyMemberRoleFn({ data: { id: invalidId, role: "MEMBER" } }),
      () => renameFamilyFn({ data: "New household" }),
      () => getMonthlySummaryFn({ data: { month: 9, year: 2026 } }),
      () => getYearlyTrendFn({ data: 2026 }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    }
    setHeadersForTests({ host: "familybudget.test" });
    await expect(
      loginFn({ data: { email: "unauth@example.test", password: "password" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rate limits login after five failures and normalizes registration email", async () => {
    const email = "unknown@example.test";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(loginFn({ data: { email, password: "bad-password" } })).rejects.toThrow(
        "Invalid email or password",
      );
    }
    await expect(loginFn({ data: { email, password: "bad-password" } })).rejects.toThrow(
      "Too many failed login attempts",
    );
    await expect(
      registerFn({
        data: {
          name: "Duplicate",
          email: familyA.owner.user.email.toUpperCase(),
          password: "strong-pass",
        },
      }),
    ).rejects.toThrow("already registered");
  });

  it("rejects missing and cross-origin state-changing requests", async () => {
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    setHeadersForTests({ host: "familybudget.test", origin: "https://attacker.example" });
    await expect(updateProfileNameFn({ data: "Changed Name" })).rejects.toMatchObject({
      statusCode: 403,
    });
    setHeadersForTests({ host: "familybudget.test" });
    await expect(updateProfileNameFn({ data: "Changed Name" })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("registers the user, family, OWNER, and defaults transactionally", async () => {
    const email = "new-family@example.test";
    configureAuthTests({ cookieHandler: () => undefined });
    await registerFn({ data: { name: "New Family", email, password: "strong-pass" } });
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    const memberships = await prisma.familyMember.findMany({
      where: { userId: user!.id },
      include: { family: true },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("OWNER");
    expect(await prisma.category.count({ where: { familyId: memberships[0]!.familyId } })).toBe(8);
  });

  it("rolls back every registration record when a mid-transaction step fails", async () => {
    const email = "rollback-family@example.test";
    configureAuthTests({
      registrationFailure: () => {
        throw new Error("simulated setup failure");
      },
    });
    await expect(
      registerFn({ data: { name: "Rollback", email, password: "strong-pass" } }),
    ).rejects.toThrow("simulated setup failure");
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.family.count({ where: { name: "Rollback's Family" } })).toBe(0);
    expect(await prisma.familyMember.count()).toBe(5);
  });
});
