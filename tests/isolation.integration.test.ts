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
import { configureActivityTests, recordActivity } from "@/lib/activity-queries";
import { hashInviteToken } from "@/lib/invite-acceptance";
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
  updateCategoryFn,
} from "@/services/category";
import {
  addFamilyMemberFn,
  changeFamilyMemberRoleFn,
  createFamilyFn,
  getMembershipFn,
  getProfileFn,
  listFamilyMembersFn,
  removeFamilyMemberFn,
  leaveFamilyFn,
  transferOwnershipFn,
  updateOwnDisplayNameFn,
  renameFamilyFn,
  updateProfileNameFn,
} from "@/services/family";
import { getMonthlySummaryFn, getYearlyTrendFn } from "@/services/report";
import { createInviteFn, listPendingInvitesFn, revokeInviteFn } from "@/services/invites";
import { listActivityFn } from "@/services/activity";
import {
  configureSettlementClockForTests,
  getBalancesFn,
  recordSettlementFn,
  deleteSettlementFn,
} from "@/services/balances";
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
    'TRUNCATE TABLE "ActivityLog", "Expense", "BudgetCategory", "Budget", "Category", "FamilyMember", "Family", "User" CASCADE',
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
  configureActivityTests({});
  configureSettlementClockForTests(undefined);
  resetLoginRateLimitForTests();
});

afterEach(async () => {
  selectAuth(null);
  setAuthResolverForTests(undefined);
  setHeadersForTests(undefined);
  configureAuthTests({});
  configureActivityTests({});
  configureSettlementClockForTests(undefined);
  resetLoginRateLimitForTests();
  await wipeTestDatabase();
});

afterAll(async () => prisma.$disconnect());

describe("PostgreSQL service isolation integration", () => {
  it("lists family members with roles, join date, activity, and the current user marker", async () => {
    const members = await listFamilyMembersFn();
    const owner = members.find((member) => member.id === familyA.owner.member.id);
    const unusedMember = members.find((member) => member.id === familyA.member!.member.id);
    expect(owner).toMatchObject({ role: "OWNER", is_you: true });
    expect(owner?.created_at).toBe(familyA.owner.member.createdAt.toISOString());
    expect(owner?.last_activity_at).not.toBeNull();
    expect(unusedMember).toMatchObject({ role: "MEMBER", is_you: false, last_activity_at: null });
  });

  it("keeps PRIVATE expenses out of other members' lists, shared reports, budgets, and activity", async () => {
    const member = familyA.member!;
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 990_000,
        date: new Date("2026-09-30T00:00:00Z"),
        description: "Only visible to its creator",
        visibility: "PRIVATE",
      },
    });

    selectAuth(authFor(familyA, member, "MEMBER"));
    expect((await listExpensesFn({ data: {} })).map((item) => item.id)).toContain(
      privateExpense.id,
    );
    expect(
      (await listExpensesFn({ data: { visibility: "PRIVATE" } })).map((item) => item.id),
    ).toEqual([privateExpense.id]);
    expect((await listExpensesFn({ data: { visibility: "PRIVATE" } }))[0]?.amount_paise).toBe(
      990_000,
    );
    const ownMembers = await listFamilyMembersFn();
    expect(ownMembers.find((item) => item.id === member.member.id)?.last_activity_at).toBeNull();

    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    expect((await listExpensesFn({ data: {} })).map((item) => item.id)).not.toContain(
      privateExpense.id,
    );
    expect(
      (await listExpensesFn({ data: { visibility: "PRIVATE" } })).map((item) => item.id),
    ).toEqual([]);
    await expect(deleteExpenseFn({ data: privateExpense.id })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      updateExpenseFn({
        data: {
          id: privateExpense.id,
          input: {
            amount: 99,
            categoryId: familyA.categoryId,
            memberId: member.member.id,
            date: "2026-09-30",
            description: "Attempted private edit",
            visibility: "SHARED",
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const visibleMembers = await listFamilyMembersFn();
    expect(
      visibleMembers.find((item) => item.id === member.member.id)?.last_activity_at,
    ).toBeNull();
    const monthly = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    expect(monthly.totalSpentPaise).toBe(7000);
    expect(monthly.expenseCount).toBe(2);
    expect((await getYearlyTrendFn({ data: 2026 }))[8]).toBe(70);
  });

  it("Mine and the private-spending data source return only the caller's family-owned private rows", async () => {
    const member = familyA.member!;
    const ownPrivate = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 2100,
        date: new Date("2026-09-29T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: familyA.admin!.user.id,
        memberId: familyA.admin!.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 3200,
        date: new Date("2026-09-29T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    await prisma.expense.create({
      data: {
        familyId: familyB.familyId,
        userId: familyB.owner.user.id,
        memberId: familyB.owner.member.id,
        categoryId: familyB.categoryId,
        amountPaise: 4300,
        date: new Date("2026-09-29T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });

    selectAuth(authFor(familyA, member, "MEMBER"));
    const mineFilter = await listExpensesFn({ data: { visibility: "PRIVATE" } });
    expect(mineFilter.map((expense) => expense.id)).toEqual([ownPrivate.id]);
    expect(mineFilter.every((expense) => expense.family_id === familyA.familyId)).toBe(true);
    expect(mineFilter.every((expense) => expense.user_id === member.user.id)).toBe(true);
    const dashboardPrivateCardData = await listExpensesFn({ data: { visibility: "PRIVATE" } });
    expect(dashboardPrivateCardData).toEqual(mineFilter);
  });

  it("isolates activity list, cursor, type/member and entity filters by family", async () => {
    const entry = {
      type: "MEMBER_JOINED" as const,
      entityType: "MEMBER" as const,
      entityId: familyA.member!.member.id,
      summary: { displayName: "Alpha member", role: "MEMBER" as const },
    };
    await prisma.$transaction((tx) =>
      recordActivity(tx, authFor(familyA, familyA.owner, "OWNER"), entry),
    );
    await prisma.$transaction((tx) =>
      recordActivity(tx, authFor(familyA, familyA.owner, "OWNER"), entry),
    );
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    const firstPage = await listActivityFn({ data: { limit: 1, type: "MEMBERS" } });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    selectAuth(authFor(familyB, familyB.owner, "OWNER"));
    const foreignFilter = await listActivityFn({
      data: {
        limit: 20,
        cursor: firstPage.nextCursor ?? undefined,
        memberId: familyA.owner.member.id,
        type: "MEMBERS",
        entityType: "MEMBER",
        entityId: familyA.member!.member.id,
      },
    });
    expect(foreignFilter.items).toEqual([]);
    expect(foreignFilter.nextCursor).toBeNull();
  });

  it("keeps private expense details out of the feed through create, update, delete and both visibility transitions", async () => {
    const member = familyA.member!;
    const secretAmountPaise = 99_888_777;
    selectAuth(authFor(familyA, member, "MEMBER"));
    const privateExpenseInput = {
      amount: secretAmountPaise / 100,
      categoryId: familyA.categoryId,
      memberId: member.member.id,
      date: "2026-09-30",
      description: "PRIVATE-DETAIL-DO-NOT-LOG",
      visibility: "PRIVATE" as const,
    };
    const initialActivityCount = (await listActivityFn({ data: { limit: 50 } })).items.length;
    await createExpenseFn({ data: privateExpenseInput });
    const privateExpense = await prisma.expense.findFirstOrThrow({
      where: { userId: member.user.id, description: privateExpenseInput.description },
    });
    await updateExpenseFn({
      data: { id: privateExpense.id, input: { ...privateExpenseInput, amount: 8 } },
    });
    await deleteExpenseFn({ data: privateExpense.id });
    expect((await listActivityFn({ data: { limit: 50 } })).items).toHaveLength(
      initialActivityCount,
    );

    await createExpenseFn({
      data: {
        ...privateExpenseInput,
        description: "Public before privatizing",
        visibility: "SHARED",
      },
    });
    const sharedId = await prisma.expense.findFirstOrThrow({
      where: { userId: member.user.id, description: "Public before privatizing" },
      select: { id: true },
    });
    await updateExpenseFn({
      data: {
        id: sharedId.id,
        input: {
          ...privateExpenseInput,
          amount: 15,
          description: "Public update",
          visibility: "SHARED",
        },
      },
    });
    const sharedEntries = await prisma.activityLog.findMany({
      where: { familyId: familyA.familyId, entityType: "EXPENSE", entityId: sharedId.id },
    });
    expect(sharedEntries.map((activity) => activity.type)).toEqual([
      "EXPENSE_CREATED",
      "EXPENSE_UPDATED",
    ]);
    await updateExpenseFn({
      data: {
        id: sharedId.id,
        input: { ...privateExpenseInput, amount: secretAmountPaise / 100, visibility: "PRIVATE" },
      },
    });
    expect(
      await prisma.activityLog.count({
        where: { familyId: familyA.familyId, entityId: sharedId.id },
      }),
    ).toBe(0);

    await createExpenseFn({ data: privateExpenseInput });
    const privateId = await prisma.expense.findFirstOrThrow({
      where: { userId: member.user.id, description: privateExpenseInput.description },
      select: { id: true },
    });
    await updateExpenseFn({
      data: {
        id: privateId.id,
        input: {
          ...privateExpenseInput,
          amount: 18,
          description: "Now shared",
          visibility: "SHARED",
        },
      },
    });
    const sharedAgain = await prisma.activityLog.findMany({
      where: { familyId: familyA.familyId, entityType: "EXPENSE", entityId: privateId.id },
    });
    expect(sharedAgain).toHaveLength(1);
    expect(sharedAgain[0]?.type).toBe("EXPENSE_CREATED");

    const allFamilyActivity = await prisma.activityLog.findMany({
      where: { familyId: familyA.familyId },
    });
    const allSummaryJson = JSON.stringify(allFamilyActivity.map((activity) => activity.summary));
    expect(allSummaryJson).not.toContain(String(secretAmountPaise));
    expect(allSummaryJson).not.toContain("PRIVATE-DETAIL-DO-NOT-LOG");
  });

  it("records budget, category and budget-category changes transactionally", async () => {
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await upsertBudgetFn({ data: { month: 9, year: 2026, totalLimit: 6200 } });
    await upsertBudgetCategoryFn({
      data: { budgetId: familyA.budgetId, categoryId: familyA.categoryId, limitAmount: 1250 },
    });
    const budgetCategory = await prisma.budgetCategory.findUniqueOrThrow({
      where: {
        budgetId_categoryId: { budgetId: familyA.budgetId, categoryId: familyA.categoryId },
      },
    });
    await deleteBudgetCategoryFn({ data: budgetCategory.id });
    await deleteBudgetFn({ data: familyA.budgetId });

    const category = await createCategoryFn({ data: { name: "Activities", color: "#123456" } });
    await updateCategoryFn({
      data: { id: category.id, input: { name: "Family activities", color: "#654321" } },
    });
    await archiveCategoryFn({ data: category.id });

    const feed = await listActivityFn({ data: { limit: 50 } });
    expect(feed.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "BUDGET_UPSERTED",
        "BUDGET_DELETED",
        "CATEGORY_CREATED",
        "CATEGORY_UPDATED",
        "CATEGORY_ARCHIVED",
      ]),
    );
    expect(feed.items.filter((item) => item.type === "BUDGET_UPSERTED").length).toBe(3);
  });

  it("rolls back action data and activity on a mid-action or logging failure", async () => {
    const auth = authFor(familyA, familyA.owner, "OWNER");
    selectAuth(auth);
    const description = "atomic-activity-test";
    const beforeExpenses = await prisma.expense.count({ where: { familyId: familyA.familyId } });
    const beforeActivity = await prisma.activityLog.count({
      where: { familyId: familyA.familyId },
    });
    configureActivityTests({
      beforeRecord: () => {
        throw new Error("forced logging failure");
      },
    });
    await expect(
      createExpenseFn({
        data: { amount: 33, categoryId: familyA.categoryId, description, date: "2026-09-30" },
      }),
    ).rejects.toThrow("forced logging failure");
    configureActivityTests({
      afterRecord: () => {
        throw new Error("forced failure after log write");
      },
    });
    await expect(
      createExpenseFn({
        data: { amount: 33, categoryId: familyA.categoryId, description, date: "2026-09-30" },
      }),
    ).rejects.toThrow("forced failure after log write");
    configureActivityTests({});
    expect(await prisma.expense.count({ where: { familyId: familyA.familyId } })).toBe(
      beforeExpenses,
    );
    expect(await prisma.activityLog.count({ where: { familyId: familyA.familyId } })).toBe(
      beforeActivity,
    );
  });

  it("shows invite events only to OWNER/ADMIN and keeps invite secrets out of every activity summary", async () => {
    process.env["APP_ORIGIN"] = "http://familybudget.test";
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await prisma.$transaction((tx) =>
      recordActivity(tx, authFor(familyA, familyA.owner, "OWNER"), {
        type: "MEMBER_JOINED",
        entityType: "MEMBER",
        entityId: familyA.member!.member.id,
        summary: { displayName: "Visible family event", role: "MEMBER" },
      }),
    );
    const invite = await createInviteFn({
      data: { role: "MEMBER", email: "secret-invitee@example.test" },
    });
    const ownerFeed = await listActivityFn({ data: { limit: 50, type: "INVITE_CREATED" } });
    expect(ownerFeed.items).toHaveLength(1);
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    expect(
      (await listActivityFn({ data: { limit: 50, type: "INVITE_CREATED" } })).items,
    ).toHaveLength(1);
    for (const identity of [familyA.member!, familyA.viewer!]) {
      selectAuth(authFor(familyA, identity, identity === familyA.member ? "MEMBER" : "VIEWER"));
      expect((await listActivityFn({ data: { limit: 50, type: "INVITE_CREATED" } })).items).toEqual(
        [],
      );
      const visibleOtherEvents = await listActivityFn({ data: { limit: 50, type: "MEMBERS" } });
      expect(visibleOtherEvents.items.some((item) => item.type === "MEMBER_JOINED")).toBe(true);
    }
    const allActivity = await prisma.activityLog.findMany({
      where: { familyId: familyA.familyId },
    });
    const safeJson = JSON.stringify(allActivity.map((activity) => activity.summary));
    expect(safeJson).not.toContain("secret-invitee@example.test");
    expect(safeJson).not.toContain(invite.link);
    const token = invite.link.split("/").at(-1) ?? "";
    expect(token).not.toBe("");
    expect(safeJson).not.toContain(token);
    expect(safeJson).not.toContain(hashInviteToken(token));
    expect(safeJson).not.toContain("tokenHash");
  });

  it("paginates 45 same-time activity rows once in stable order and combines member/type filters", async () => {
    const sameTime = new Date("2026-10-05T12:00:00Z");
    configureActivityTests({ createdAt: sameTime });
    for (let index = 0; index < 45; index += 1) {
      const actor = index < 30 ? familyA.owner : familyA.admin!;
      const role = index < 30 ? "OWNER" : "ADMIN";
      await prisma.$transaction((tx) =>
        recordActivity(tx, authFor(familyA, actor, role), {
          type: "MEMBER_ROLE_CHANGED",
          entityType: "MEMBER",
          entityId: `pagination-${index}`,
          summary: { displayName: `Test member ${index}`, oldRole: "MEMBER", newRole: "VIEWER" },
        }),
      );
    }
    configureActivityTests({});
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    const allIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listActivityFn({
        data: { limit: 7, ...(cursor ? { cursor } : {}), type: "MEMBER_ROLE_CHANGED" },
      });
      allIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(allIds).toHaveLength(45);
    expect(new Set(allIds).size).toBe(45);
    const ownerFiltered = await listActivityFn({
      data: { limit: 50, memberId: familyA.owner.member.id, type: "MEMBER_ROLE_CHANGED" },
    });
    const adminFiltered = await listActivityFn({
      data: { limit: 50, memberId: familyA.admin!.member.id, type: "MEMBER_ROLE_CHANGED" },
    });
    expect(ownerFiltered.items).toHaveLength(30);
    expect(adminFiltered.items).toHaveLength(15);
    const expectedOrder = await prisma.activityLog.findMany({
      where: { familyId: familyA.familyId, type: "MEMBER_ROLE_CHANGED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    expect(allIds).toEqual(expectedOrder.map((entry) => entry.id));
  });

  it("preserves a removed member's historical actor snapshot and groups former-member shared spending separately", async () => {
    const member = familyA.member!;
    selectAuth(authFor(familyA, member, "MEMBER"));
    await createExpenseFn({
      data: {
        amount: 61,
        categoryId: familyA.categoryId,
        memberId: member.member.id,
        date: "2026-09-30",
        description: "shared before leaving",
      },
    });
    await createExpenseFn({
      data: {
        amount: 99_999,
        categoryId: familyA.categoryId,
        memberId: member.member.id,
        date: "2026-09-30",
        description: "private must not enter member chart",
        visibility: "PRIVATE",
      },
    });
    await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: null,
        memberNameSnapshot: "Legacy Former",
        categoryId: familyA.categoryId,
        amountPaise: 500,
        date: new Date("2026-09-30T00:00:00Z"),
      },
    });
    const rawBefore = await prisma.$queryRaw<
      Array<{ memberId: string | null; memberIdSnapshot: string | null; totalPaise: number }>
    >`
      SELECT "memberId", "memberIdSnapshot", COALESCE(SUM("amountPaise"), 0)::int AS "totalPaise"
      FROM "Expense"
      WHERE "familyId" = ${familyA.familyId} AND "visibility" = 'SHARED'::"ExpenseVisibility"
        AND "date" >= '2026-09-01' AND "date" < '2026-10-01'
      GROUP BY "memberId", "memberIdSnapshot"
    `;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    const before = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    const totalRawBefore = rawBefore.reduce((sum, row) => sum + row.totalPaise, 0);
    expect(before.totalSpentPaise).toBe(totalRawBefore);
    await removeFamilyMemberFn({ data: member.member.id });
    const after = await getMonthlySummaryFn({
      data: { month: 9, year: 2026, memberId: member.member.id },
    });
    const rawFormerMember = await prisma.$queryRaw<Array<{ totalPaise: number }>>`
      SELECT COALESCE(SUM("amountPaise"), 0)::int AS "totalPaise"
      FROM "Expense"
      WHERE "familyId" = ${familyA.familyId}
        AND "visibility" = 'SHARED'::"ExpenseVisibility"
        AND "memberIdSnapshot" = ${member.member.id}
        AND "date" >= '2026-09-01' AND "date" < '2026-10-01'
    `;
    expect(after.spendingByMember).toEqual([
      expect.objectContaining({
        memberId: member.member.id,
        memberName: `Former member (${member.member.displayName})`,
        amountPaise: 6100,
      }),
    ]);
    expect(after.spendingByMember[0]?.amountPaise).toBe(rawFormerMember[0]?.totalPaise);
    expect((await getYearlyTrendFn({ data: { year: 2026, memberId: member.member.id } }))[8]).toBe(
      61,
    );
    const formerActivity = await prisma.activityLog.findFirstOrThrow({
      where: {
        familyId: familyA.familyId,
        type: "EXPENSE_CREATED",
        summary: { path: ["description"], equals: "shared before leaving" },
      },
    });
    expect(formerActivity.actorMemberId).toBe(member.member.id);
    expect(formerActivity.actorNameSnapshot).toBe(member.member.displayName);
    const formerExpense = await prisma.expense.findFirstOrThrow({
      where: { familyId: familyA.familyId, description: "shared before leaving" },
      select: { id: true },
    });
    const formerFeedItem = await listActivityFn({
      data: { limit: 20, entityType: "EXPENSE", entityId: formerExpense.id },
    });
    expect(formerFeedItem.items[0]?.actorName).toBe(`${member.member.displayName} (former member)`);
    expect(after.totalSpentPaise).toBe(6100);
    const allMembers = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    expect(allMembers.spendingByMember).toContainEqual(
      expect.objectContaining({
        memberId: null,
        memberName: "Former member (Legacy Former)",
        amountPaise: 500,
      }),
    );
  });

  it("keeps a ₹9,99,999 private expense out of every other member aggregate against raw shared SQL", async () => {
    const member = familyA.member!;
    const rawShared = async () => {
      const [totals] = await prisma.$queryRaw<Array<{ totalPaise: number; count: number }>>`
        SELECT COALESCE(SUM("amountPaise"), 0)::int AS "totalPaise",
               COUNT(*)::int AS count
        FROM "Expense"
        WHERE "familyId" = ${familyA.familyId}
          AND "visibility" = 'SHARED'::"ExpenseVisibility"
          AND "date" >= '2026-09-01' AND "date" < '2026-10-01'
      `;
      return totals!;
    };
    const rawCategories = async () =>
      prisma.$queryRaw<Array<{ categoryId: string; totalPaise: number }>>`
        SELECT "categoryId", SUM("amountPaise")::int AS "totalPaise"
        FROM "Expense"
        WHERE "familyId" = ${familyA.familyId}
          AND "visibility" = 'SHARED'::"ExpenseVisibility"
          AND "date" >= '2026-09-01' AND "date" < '2026-10-01'
        GROUP BY "categoryId"
      `;
    const rawMemberActivity = async () =>
      prisma.$queryRaw<Array<{ memberId: string; lastActivity: Date }>>`
        SELECT "memberId", MAX("updatedAt") AS "lastActivity"
        FROM "Expense"
        WHERE "familyId" = ${familyA.familyId}
          AND "visibility" = 'SHARED'::"ExpenseVisibility"
          AND "memberId" IS NOT NULL
        GROUP BY "memberId"
      `;
    const rawBefore = await rawShared();
    const rawCategoriesBefore = await rawCategories();
    const rawActivityBefore = await rawMemberActivity();
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    const monthlyBefore = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    const yearlyBefore = await getYearlyTrendFn({ data: 2026 });
    const membersBefore = await listFamilyMembersFn();

    const hugePrivate = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 99_999_900,
        date: new Date("2026-09-30T00:00:00Z"),
        updatedAt: new Date("2027-01-01T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: familyA.admin!.user.id,
        memberId: familyA.admin!.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 77_777_700,
        date: new Date("2026-09-30T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    const rawAfter = await rawShared();
    const rawCategoriesAfter = await rawCategories();
    const rawActivityAfter = await rawMemberActivity();
    const monthlyAfter = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    const yearlyAfter = await getYearlyTrendFn({ data: 2026 });
    const membersAfter = await listFamilyMembersFn();
    const otherUsersRows = await listExpensesFn({ data: { visibility: "VISIBLE" } });

    expect(rawAfter).toEqual(rawBefore);
    expect(rawCategoriesAfter).toEqual(rawCategoriesBefore);
    expect(rawActivityAfter).toEqual(rawActivityBefore);
    expect(monthlyAfter.totalSpentPaise).toBe(rawAfter.totalPaise);
    expect(monthlyAfter.totalSpentPaise).toBe(monthlyBefore.totalSpentPaise);
    expect(monthlyAfter.expenseCount).toBe(rawAfter.count);
    expect(monthlyAfter.expenseCount).toBe(monthlyBefore.expenseCount);
    expect(monthlyAfter.remainingPaise).toBe(monthlyBefore.remainingPaise);
    for (const category of monthlyAfter.categories) {
      const independent = rawCategoriesAfter.find((row) => row.categoryId === category.categoryId);
      const spentPaise = independent?.totalPaise ?? 0;
      expect(category.spentPaise).toBe(spentPaise);
      expect(category.remainingPaise).toBe(category.limitPaise - spentPaise);
    }
    expect(monthlyAfter.percent).toBe(monthlyBefore.percent);
    expect(monthlyAfter.totalLimitPaise - rawAfter.totalPaise).toBe(monthlyAfter.remainingPaise);
    expect(yearlyAfter).toEqual(yearlyBefore);
    expect(membersAfter).toEqual(membersBefore);
    for (const memberRow of membersAfter) {
      expect(memberRow.last_activity_at).toBe(
        rawActivityAfter.find((row) => row.memberId === memberRow.id)?.lastActivity.toISOString() ??
          null,
      );
    }
    expect(otherUsersRows.map((expense) => expense.id)).not.toContain(hugePrivate.id);

    selectAuth(authFor(familyA, member, "MEMBER"));
    const mine = await listExpensesFn({ data: { visibility: "PRIVATE" } });
    expect(mine.map((expense) => expense.id)).toEqual([hugePrivate.id]);
    expect(mine.every((expense) => expense.user_id === member.user.id)).toBe(true);
  });

  it("returns the same 404 to OWNER and ADMIN for another member's private expense mutations", async () => {
    const member = familyA.member!;
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 5000,
        date: new Date("2026-09-30T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    const errors: Array<{ statusCode: number; message: string }> = [];
    for (const actor of [familyA.owner, familyA.admin!]) {
      selectAuth(authFor(familyA, actor, actor === familyA.owner ? "OWNER" : "ADMIN"));
      expect(
        (await listExpensesFn({ data: { visibility: "VISIBLE" } })).map((item) => item.id),
      ).not.toContain(privateExpense.id);
      expect(
        (await listExpensesFn({ data: { visibility: "PRIVATE" } })).map((item) => item.id),
      ).not.toContain(privateExpense.id);
      for (const action of ["delete", "visibility-change"] as const) {
        const call =
          action === "delete"
            ? deleteExpenseFn({ data: privateExpense.id })
            : updateExpenseFn({
                data: {
                  id: privateExpense.id,
                  input: {
                    amount: 50,
                    categoryId: familyA.categoryId,
                    memberId: member.member.id,
                    date: "2026-09-30",
                    visibility: "SHARED",
                  },
                },
              });
        await expect(call).rejects.toMatchObject({ statusCode: 404, message: "Expense not found" });
        errors.push({ statusCode: 404, message: "Expense not found" });
      }
    }
    expect(new Set(errors.map((error) => `${error.statusCode}:${error.message}`))).toEqual(
      new Set(["404:Expense not found"]),
    );
    expect(await prisma.expense.findUnique({ where: { id: privateExpense.id } })).not.toBeNull();
  });

  it("changes shared aggregates in both visibility directions and restricts private attribution to its creator", async () => {
    const member = familyA.member!;
    const starting = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    selectAuth(authFor(familyA, member, "MEMBER"));
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 12_345,
        date: new Date("2026-09-30T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    const privateSummary = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    expect(privateSummary.totalSpentPaise).toBe(starting.totalSpentPaise);
    await updateExpenseFn({
      data: {
        id: privateExpense.id,
        input: {
          amount: 123.45,
          categoryId: familyA.categoryId,
          memberId: member.member.id,
          date: "2026-09-30",
          visibility: "SHARED",
        },
      },
    });
    const sharedSummary = await getMonthlySummaryFn({ data: { month: 9, year: 2026 } });
    expect(sharedSummary.totalSpentPaise).toBe(starting.totalSpentPaise + 12_345);
    await updateExpenseFn({
      data: {
        id: privateExpense.id,
        input: {
          amount: 123.45,
          categoryId: familyA.categoryId,
          memberId: member.member.id,
          date: "2026-09-30",
          visibility: "PRIVATE",
        },
      },
    });
    expect((await getMonthlySummaryFn({ data: { month: 9, year: 2026 } })).totalSpentPaise).toBe(
      starting.totalSpentPaise,
    );

    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await expect(
      updateExpenseFn({
        data: {
          id: familyA.adminExpenseId!,
          input: {
            amount: 45,
            categoryId: familyA.categoryId,
            memberId: familyA.owner.member.id,
            date: "2026-09-30",
            visibility: "PRIVATE",
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    await expect(
      updateExpenseFn({
        data: {
          id: familyA.adminExpenseId!,
          input: {
            amount: 45,
            categoryId: familyA.categoryId,
            memberId: familyA.owner.member.id,
            date: "2026-09-30",
            visibility: "PRIVATE",
          },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

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
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
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

  it("enforces every actor, target, and requested role combination", async () => {
    const actors: Array<[Role, FixtureMember]> = [
      ["OWNER", familyA.owner],
      ["ADMIN", familyA.admin!],
      ["MEMBER", familyA.member!],
      ["VIEWER", familyA.viewer!],
    ];
    const targets: Array<[Role, FixtureMember]> = actors;
    const nextRoles = ["ADMIN", "MEMBER", "VIEWER"] as const;
    for (const [actorRole, actor] of actors) {
      for (const [targetRole, target] of targets) {
        for (const nextRole of nextRoles) {
          await Promise.all(
            actors.map(([originalRole, member]) =>
              prisma.familyMember.update({
                where: { id: member.member.id },
                data: { role: originalRole },
              }),
            ),
          );
          await prisma.familyMember.update({
            where: { id: target.member.id },
            data: { role: targetRole },
          });
          selectAuth(authFor(familyA, actor, actorRole));
          const allowed =
            targetRole !== "OWNER" &&
            (actorRole === "OWNER" ||
              (actorRole === "ADMIN" &&
                (targetRole === "MEMBER" || targetRole === "VIEWER") &&
                nextRole !== "ADMIN"));
          const call = changeFamilyMemberRoleFn({ data: { id: target.member.id, role: nextRole } });
          if (allowed) {
            await expect(call).resolves.toBeUndefined();
            expect(
              (await prisma.familyMember.findUniqueOrThrow({ where: { id: target.member.id } }))
                .role,
            ).toBe(nextRole);
          } else {
            await expect(call).rejects.toMatchObject({
              statusCode: targetRole === "OWNER" && actorRole === "OWNER" ? 409 : 403,
            });
          }
        }
      }
    }
  });

  it("restricts removal, preserves expense history, and immediately rejects the removed account", async () => {
    const target = familyA.member!;
    const expense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: familyA.owner.user.id,
        memberId: target.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 4200,
        date: new Date("2026-10-01T00:00:00Z"),
        description: "History",
      },
    });
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: target.user.id,
        memberId: target.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 8800,
        date: new Date("2026-10-01T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    await expect(removeFamilyMemberFn({ data: familyA.owner.member.id })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      changeFamilyMemberRoleFn({ data: { id: familyA.admin!.member.id, role: "MEMBER" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(removeFamilyMemberFn({ data: familyA.admin!.member.id })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(removeFamilyMemberFn({ data: familyA.owner.member.id })).rejects.toMatchObject({
      statusCode: 403,
    });
    selectAuth(authFor(familyA, target, "MEMBER"));
    await updateOwnDisplayNameFn({ data: "  Changed Name  " });
    expect(
      (await prisma.familyMember.findUniqueOrThrow({ where: { id: target.member.id } }))
        .displayName,
    ).toBe("Changed Name");
    expect(
      (await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).memberNameSnapshot,
    ).toBeNull();
    process.env["APP_ORIGIN"] = "http://familybudget.test";
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    const adminInvite = await createInviteFn({ data: { role: "MEMBER" } });
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await removeFamilyMemberFn({ data: familyA.admin!.member.id });
    expect(
      (await prisma.invite.findUniqueOrThrow({ where: { id: adminInvite.id } })).createdByMemberId,
    ).toBe(familyA.admin!.member.id);
    expect(
      (await listPendingInvitesFn()).find((invite) => invite.id === adminInvite.id)?.creatorStatus,
    ).toBe("REMOVED");
    await revokeInviteFn({ data: adminInvite.id });
    await removeFamilyMemberFn({ data: target.member.id });
    const saved = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(saved.memberId).toBe(target.member.id);
    expect(saved.memberNameSnapshot).toBe("Changed Name");
    expect(
      (await prisma.familyMember.findUniqueOrThrow({ where: { id: target.member.id } })).formerAt,
    ).not.toBeNull();
    expect(await prisma.expense.findUnique({ where: { id: privateExpense.id } })).toBeNull();
    expect(
      (await listExpensesFn({ data: {} })).find((item) => item.id === expense.id)?.family_member,
    ).toBe("Former member (Changed Name)");
    selectAuth(authFor(familyA, target, "MEMBER"));
    await expect(listFamilyMembersFn()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("blocks sole-owner leave/demotion and makes ownership transfer race-safe", async () => {
    await expect(leaveFamilyFn({ data: undefined })).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      changeFamilyMemberRoleFn({ data: { id: familyA.owner.member.id, role: "MEMBER" } }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const candidates = [familyA.admin!, familyA.member!];
    const transfers = candidates.map((candidate) =>
      transferOwnershipFn({
        data: { targetMemberId: candidate.member.id, familyNameConfirmation: "Alpha household" },
      }),
    );
    const results = await Promise.allSettled(transfers);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.familyMember.count({ where: { familyId: familyA.familyId, role: "OWNER" } }),
    ).toBe(1);
  });

  it("lets an ADMIN remove only MEMBER/VIEWER and lets ordinary members leave with history", async () => {
    const anotherAdminUser = await createUser("Second admin", "second-admin@example.test");
    const anotherAdmin = await prisma.familyMember.create({
      data: {
        familyId: familyA.familyId,
        userId: anotherAdminUser.id,
        displayName: "Second admin",
        role: "ADMIN",
      },
    });
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    await expect(removeFamilyMemberFn({ data: anotherAdmin.id })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(removeFamilyMemberFn({ data: familyA.owner.member.id })).rejects.toMatchObject({
      statusCode: 403,
    });

    const member = familyA.member!;
    const expense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: familyA.owner.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 1234,
        date: new Date("2026-10-02T00:00:00Z"),
      },
    });
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: member.user.id,
        memberId: member.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 3456,
        date: new Date("2026-10-02T00:00:00Z"),
        visibility: "PRIVATE",
      },
    });
    selectAuth(authFor(familyA, member, "MEMBER"));
    await leaveFamilyFn({ data: undefined });
    const saved = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(saved.memberId).toBe(member.member.id);
    expect(saved.memberNameSnapshot).toBe(member.member.displayName);
    expect(await prisma.expense.findUnique({ where: { id: privateExpense.id } })).toBeNull();
  });

  it("allows a membership-free account to create exactly one family and returns 404 for foreign member IDs", async () => {
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await expect(removeFamilyMemberFn({ data: familyB.owner.member.id })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      changeFamilyMemberRoleFn({ data: { id: familyB.owner.member.id, role: "MEMBER" } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    const user = await createUser("Familyless", "familyless@example.test");
    selectAuth({
      userId: user.id,
      familyId: familyA.familyId,
      memberId: familyA.owner.member.id,
      role: "OWNER",
      user: { id: user.id, name: user.name, email: user.email },
    });
    await createFamilyFn({ data: "My new family" });
    expect(await prisma.familyMember.count({ where: { userId: user.id } })).toBe(1);
    await expect(createFamilyFn({ data: "Second family" })).rejects.toMatchObject({
      statusCode: 409,
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

  it("creates an exact paise equal split, records suggestions, and settles all three balances", async () => {
    const admin = familyA.admin!;
    const member = familyA.member!;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await createExpenseFn({
      data: {
        amount: 100,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        memberId: familyA.owner.member.id,
        split: {
          mode: "EQUAL",
          memberIds: [familyA.owner.member.id, admin.member.id, member.member.id],
        },
      },
    });
    const expense = await prisma.expense.findFirstOrThrow({
      where: { familyId: familyA.familyId, date: new Date("2026-10-06T00:00:00Z") },
      include: { splits: true },
    });
    expect(expense.splits.map(({ sharePaise }) => sharePaise)).toEqual([3334, 3333, 3333]);
    let balances = await getBalancesFn({ data: undefined });
    const splitByMember = new Map(
      expense.splits.map((split) => [split.memberId, split.sharePaise]),
    );
    expect(balances.members.map(({ memberId, netPaise }) => [memberId, netPaise])).toEqual(
      expect.arrayContaining([
        [familyA.owner.member.id, 10000 - splitByMember.get(familyA.owner.member.id)!],
        [admin.member.id, -splitByMember.get(admin.member.id)!],
        [member.member.id, -splitByMember.get(member.member.id)!],
      ]),
    );
    for (const payment of balances.suggestedPayments) {
      await recordSettlementFn({
        data: {
          fromMemberId: payment.fromMemberId,
          toMemberId: payment.toMemberId,
          amount: payment.amountPaise / 100,
        },
      });
    }
    balances = await getBalancesFn({ data: undefined });
    expect(balances.members.every(({ netPaise }) => netPaise === 0)).toBe(true);
    expect(balances.suggestedPayments).toEqual([]);
    const splitLog = await prisma.activityLog.findFirstOrThrow({
      where: { familyId: familyA.familyId, type: "SPLIT_CREATED" },
    });
    expect(splitLog.summary).toEqual({ amountPaise: 10000, participantCount: 3, mode: "EQUAL" });
  });

  it("blocks private splits, foreign participants, private toggles, and cross-family balance reads", async () => {
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await expect(
      createExpenseFn({
        data: {
          amount: 1,
          categoryId: familyA.categoryId,
          date: "2026-10-06",
          visibility: "PRIVATE",
          split: { mode: "EQUAL", memberIds: [familyA.owner.member.id] },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      createExpenseFn({
        data: {
          amount: 100,
          categoryId: familyA.categoryId,
          date: "2026-10-06",
          split: {
            mode: "EXACT",
            participants: [{ memberId: familyB.owner.member.id, sharePaise: 10000 }],
          },
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectStatus(error, 404);
      return true;
    });
    await createExpenseFn({
      data: {
        amount: 20,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, familyA.member!.member.id] },
      },
    });
    const splitExpense = await prisma.expense.findFirstOrThrow({
      where: { familyId: familyA.familyId, splits: { some: {} } },
    });
    await expect(
      updateExpenseFn({
        data: {
          id: splitExpense.id,
          input: {
            amount: 20,
            categoryId: familyA.categoryId,
            date: "2026-10-06",
            visibility: "PRIVATE",
          },
        },
      }),
    ).rejects.toThrow("Remove the split first");
    await updateExpenseFn({
      data: {
        id: splitExpense.id,
        input: {
          amount: 20,
          categoryId: familyA.categoryId,
          date: "2026-10-06",
          split: null,
        },
      },
    });
    await updateExpenseFn({
      data: {
        id: splitExpense.id,
        input: {
          amount: 20,
          categoryId: familyA.categoryId,
          date: "2026-10-06",
          visibility: "PRIVATE",
        },
      },
    });
    expect(await prisma.expenseSplit.count({ where: { expenseId: splitExpense.id } })).toBe(0);
    const familyABalancesBeforePrivate = await getBalancesFn({ data: undefined });
    const privateExpense = await prisma.expense.create({
      data: {
        familyId: familyA.familyId,
        userId: familyA.owner.user.id,
        memberId: familyA.owner.member.id,
        categoryId: familyA.categoryId,
        amountPaise: 500_000,
        visibility: "PRIVATE",
      },
    });
    expect(
      (await getBalancesFn({ data: undefined })).members.map(({ memberId, netPaise }) => [
        memberId,
        netPaise,
      ]),
    ).toEqual(
      familyABalancesBeforePrivate.members.map(({ memberId, netPaise }) => [memberId, netPaise]),
    );
    selectAuth(authFor(familyB, familyB.owner, "OWNER"));
    const bBalances = await getBalancesFn({ data: undefined });
    expect(bBalances.members.some(({ memberId }) => memberId === familyA.owner.member.id)).toBe(
      false,
    );
    await expect(deleteExpenseFn({ data: privateExpense.id })).rejects.toSatisfy(
      (error: unknown) => {
        expectStatus(error, 404);
        return true;
      },
    );
    await expect(
      updateExpenseFn({
        data: {
          id: splitExpense.id,
          input: {
            amount: 20,
            categoryId: familyB.categoryId,
            date: "2026-10-06",
          },
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectStatus(error, 404);
      return true;
    });
    await expect(
      recordSettlementFn({
        data: {
          fromMemberId: familyA.owner.member.id,
          toMemberId: familyB.owner.member.id,
          amount: 10,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectStatus(error, 404);
      return true;
    });
  });

  it("recomputes splits on amount edits, cascades them on expense deletion, and keeps totals zero", async () => {
    const member = familyA.member!;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await createExpenseFn({
      data: {
        amount: 10,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
      },
    });
    const row = await prisma.expense.findFirstOrThrow({
      where: { familyId: familyA.familyId, splits: { some: {} } },
      include: { splits: true },
    });
    await updateExpenseFn({
      data: {
        id: row.id,
        input: { amount: 12, categoryId: familyA.categoryId, date: "2026-10-06" },
      },
    });
    const edited = await prisma.expense.findUniqueOrThrow({
      where: { id: row.id },
      include: { splits: true },
    });
    expect(edited.splits.map(({ sharePaise }) => sharePaise)).toEqual([600, 600]);
    const [sum] = await prisma.$queryRaw<
      Array<{ total: number }>
    >`SELECT COALESCE(SUM("sharePaise"),0)::int AS total FROM "ExpenseSplit" WHERE "expenseId" = ${row.id}`;
    expect(sum?.total).toBe(edited.amountPaise);
    await deleteExpenseFn({ data: row.id });
    expect(await prisma.expenseSplit.count({ where: { expenseId: row.id } })).toBe(0);
    expect(
      (await getBalancesFn({ data: undefined })).members.every(({ netPaise }) => netPaise === 0),
    ).toBe(true);
  });

  it("blocks removal with debt, preserves settled split history as former members, and retains settlements", async () => {
    const member = familyA.member!;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await createExpenseFn({
      data: {
        amount: 50,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        memberId: familyA.owner.member.id,
        split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
      },
    });
    await expect(removeFamilyMemberFn({ data: member.member.id })).rejects.toThrow(
      /Settle up first: you have an outstanding balance/,
    );
    let balances = await getBalancesFn({ data: undefined });
    const memberDebt = balances.suggestedPayments.find(
      (payment) => payment.fromMemberId === member.member.id,
    )!;
    await recordSettlementFn({
      data: {
        fromMemberId: member.member.id,
        toMemberId: familyA.owner.member.id,
        amount: memberDebt.amountPaise / 100,
      },
    });
    balances = await getBalancesFn({ data: undefined });
    expect(balances.members.every(({ netPaise }) => netPaise === 0)).toBe(true);
    await removeFamilyMemberFn({ data: member.member.id });
    const former = await prisma.familyMember.findUniqueOrThrow({ where: { id: member.member.id } });
    expect(former.formerAt).not.toBeNull();
    expect(former.userId).toBeNull();
    expect(await prisma.expenseSplit.count({ where: { memberId: former.id } })).toBe(1);
    expect(await prisma.settlement.count({ where: { fromMemberId: former.id } })).toBe(1);
    const afterRemoval = await getBalancesFn({ data: undefined });
    expect(afterRemoval.members.find(({ memberId }) => memberId === former.id)?.name).toBe(
      `${member.member.displayName} (former member)`,
    );
    expect(afterRemoval.settlements[0]?.fromName).toBe(
      `${member.member.displayName} (former member)`,
    );
  });

  it("blocks leave with debt, then preserves split and settlement history after payment", async () => {
    const member = familyA.member!;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await createExpenseFn({
      data: {
        amount: 24,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        memberId: familyA.owner.member.id,
        split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
      },
    });
    selectAuth(authFor(familyA, member, "MEMBER"));
    await expect(leaveFamilyFn({ data: undefined })).rejects.toThrow(/Settle up first/);
    const balances = await getBalancesFn({ data: undefined });
    const payment = balances.suggestedPayments.find(
      (item) => item.fromMemberId === member.member.id,
    )!;
    await recordSettlementFn({
      data: {
        fromMemberId: member.member.id,
        toMemberId: familyA.owner.member.id,
        amount: payment.amountPaise / 100,
      },
    });
    await leaveFamilyFn({ data: undefined });
    expect(await prisma.expenseSplit.count({ where: { memberId: member.member.id } })).toBe(1);
    expect(await prisma.settlement.count({ where: { fromMemberId: member.member.id } })).toBe(1);
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    const afterLeave = await getBalancesFn({ data: undefined });
    expect(afterLeave.members.find((item) => item.memberId === member.member.id)?.former).toBe(
      true,
    );
    expect(afterLeave.settlements[0]?.fromName).toBe(
      `${member.member.displayName} (former member)`,
    );
    selectAuth(authFor(familyA, member, "MEMBER"));
    await expect(getBalancesFn({ data: undefined })).rejects.toMatchObject({ statusCode: 401 });
  });

  it("enforces settlement payer/receiver, role and 24-hour deletion rules with safe activity summaries", async () => {
    const member = familyA.member!;
    const viewer = familyA.viewer!;
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    await recordSettlementFn({
      data: { fromMemberId: member.member.id, toMemberId: familyA.owner.member.id, amount: 5 },
    });
    selectAuth(authFor(familyA, viewer, "VIEWER"));
    await expect(
      recordSettlementFn({
        data: { fromMemberId: viewer.member.id, toMemberId: familyA.owner.member.id, amount: 5 },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    selectAuth(authFor(familyA, member, "MEMBER"));
    await recordSettlementFn({
      data: {
        fromMemberId: member.member.id,
        toMemberId: familyA.owner.member.id,
        amount: 5,
        note: "private note",
      },
    });
    const settlement = await prisma.settlement.findFirstOrThrow({
      where: { familyId: familyA.familyId, createdByMemberId: member.member.id },
    });
    configureSettlementClockForTests(
      () => new Date(settlement.createdAt.getTime() + 25 * 60 * 60 * 1000),
    );
    await expect(deleteSettlementFn({ data: settlement.id })).rejects.toThrow(/within 24 hours/);
    selectAuth(authFor(familyA, familyA.admin!, "ADMIN"));
    await deleteSettlementFn({ data: settlement.id });
    const logs = await prisma.activityLog.findMany({
      where: {
        familyId: familyA.familyId,
        type: { in: ["SETTLEMENT_RECORDED", "SETTLEMENT_DELETED"] },
      },
    });
    expect(logs.map(({ type }) => type)).toEqual(
      expect.arrayContaining(["SETTLEMENT_RECORDED", "SETTLEMENT_DELETED"]),
    );
    expect(JSON.stringify(logs.map(({ summary }) => summary))).not.toContain("private note");
  });

  it("keeps concurrent settlement and split writes atomic with zero-sum balances", async () => {
    const member = familyA.member!;
    selectAuth(authFor(familyA, familyA.owner, "OWNER"));
    await createExpenseFn({
      data: {
        amount: 40,
        categoryId: familyA.categoryId,
        date: "2026-10-06",
        memberId: familyA.owner.member.id,
        split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
      },
    });
    const splitExpense = await prisma.expense.findFirstOrThrow({
      where: { familyId: familyA.familyId, splits: { some: {} } },
    });
    const settlements = await Promise.all([
      recordSettlementFn({
        data: { fromMemberId: member.member.id, toMemberId: familyA.owner.member.id, amount: 1 },
      }),
      recordSettlementFn({
        data: { fromMemberId: member.member.id, toMemberId: familyA.owner.member.id, amount: 2 },
      }),
    ]);
    expect(settlements).toHaveLength(2);
    const edits = await Promise.allSettled([
      updateExpenseFn({
        data: {
          id: splitExpense.id,
          input: {
            amount: 42,
            categoryId: familyA.categoryId,
            date: "2026-10-06",
            split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
          },
        },
      }),
      updateExpenseFn({
        data: {
          id: splitExpense.id,
          input: {
            amount: 44,
            categoryId: familyA.categoryId,
            date: "2026-10-06",
            split: { mode: "EQUAL", memberIds: [familyA.owner.member.id, member.member.id] },
          },
        },
      }),
    ]);
    expect(edits.some((item) => item.status === "fulfilled")).toBe(true);
    const rows = await prisma.expense.findUniqueOrThrow({
      where: { id: splitExpense.id },
      include: { splits: true },
    });
    expect(rows.splits).toHaveLength(2);
    expect(rows.splits.reduce((sum, row) => sum + row.sharePaise, 0)).toBe(rows.amountPaise);
    expect(
      [
        ...(await getBalancesFn({ data: undefined })).members.map(({ netPaise }) => netPaise),
      ].reduce((sum, item) => sum + item, 0),
    ).toBe(0);
  });
});
