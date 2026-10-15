import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parseInput = (input: unknown) => input;
    const builder = {
      validator(schema: { parse: (input: unknown) => unknown }) {
        parseInput = (input) => schema.parse(input);
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
import { setAuthResolverForTests } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import {
  contributeToFundFn,
  createGoalFn,
  createSinkingFundFn,
  getPlanningAssetsFn,
} from "@/services/planning-assets";
import { generateFamilyStoryFn, getFamilyStoryFn } from "@/services/family-story";
import {
  createScenarioFn,
  deleteScenarioFn,
  listScenariosFn,
  renameScenarioFn,
} from "@/services/planner";
import { getFinancialHealthFn } from "@/services/financial-health";
import { createExpenseFn, searchExpensesForCommandFn } from "@/services/expense";
import { exportExpensesFn } from "@/services/export";

describe("family planning assets", () => {
  const suffix = crypto.randomUUID();
  let familyId = "";
  let ownerId = "";
  let memberId = "";
  let fundId = "";
  let categoryId = "";
  let role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" = "OWNER";

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        name: "Planning test",
        email: `planning-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    ownerId = owner.id;
    const family = await prisma.family.create({ data: { name: `Planning ${suffix}`, ownerId } });
    familyId = family.id;
    const member = await prisma.familyMember.create({
      data: { familyId, userId: ownerId, displayName: "Planning owner", role: "OWNER" },
    });
    memberId = member.id;
    const category = await prisma.category.create({ data: { familyId, name: "Food" } });
    categoryId = category.id;
    setAuthResolverForTests(async () => ({
      userId: ownerId,
      familyId,
      memberId,
      role,
      user: { id: owner.id, name: owner.name, email: owner.email },
    }));
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  it("family-scopes funds and computes contributions and monthly set-asides", async () => {
    const fund = await createSinkingFundFn({
      data: { name: "School fees", targetPaise: 120_000, dueDate: "2027-01-01" },
    });
    fundId = fund.id;
    await contributeToFundFn({ data: { fundId, amountPaise: 20_000 } });
    await createGoalFn({
      data: { name: "Emergency", targetPaise: 500_000, targetDate: "2027-01-01" },
    });
    const now = new Date();
    await prisma.incomeProfile.create({
      data: { familyId, monthlyIncomePaise: 100_000 },
    });
    await prisma.expense.createMany({
      data: [
        ...[1, 2, 3].map((monthsAgo) => ({
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 60_000,
          date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 10, 12)),
          description: `Feasibility shared ${monthsAgo}`,
          visibility: "SHARED" as const,
        })),
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 900_000,
          date: now,
          description: "Feasibility private outlier",
          visibility: "PRIVATE" as const,
        },
      ],
    });
    const assets = await getPlanningAssetsFn({ data: undefined });
    expect(assets.funds).toHaveLength(1);
    expect(assets.funds[0]?.contributedPaise).toBe(20_000);
    const dueDate = new Date("2027-01-01T00:00:00.000Z");
    const monthsLeft = Math.max(
      1,
      (dueDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
        dueDate.getUTCMonth() -
        now.getUTCMonth(),
    );
    expect(assets.funds[0]?.monthlySetAsidePaise).toBe(Math.ceil((120_000 - 20_000) / monthsLeft));
    expect(assets.goals).toHaveLength(1);
    expect(assets.goals[0]?.monthlyPlanPaise).toBeGreaterThan(0);
    expect(assets.feasibility).toMatchObject({
      historyMonths: 3,
      requiredHistoryMonths: 3,
      averageMonthlySharedSpendPaise: 60_000,
      monthlyIncomePaise: 100_000,
      availableMonthlySavingsPaise: 40_000,
      isFeasible: false,
    });
    expect(assets.feasibility.monthlyCommitmentPaise).toBeGreaterThan(40_000);
    await prisma.expense.deleteMany({
      where: { familyId, description: "Feasibility shared 3" },
    });
    const incompleteHistory = await getPlanningAssetsFn({ data: undefined });
    expect(incompleteHistory.feasibility).toMatchObject({
      historyMonths: 2,
      averageMonthlySharedSpendPaise: null,
      availableMonthlySavingsPaise: null,
      isFeasible: null,
    });
    await prisma.expense.deleteMany({
      where: { familyId, description: { startsWith: "Feasibility " } },
    });
    await prisma.incomeProfile.deleteMany({ where: { familyId } });
  });

  it("persists scenarios, records create/delete activity, and denies viewers management", async () => {
    const scenario = await createScenarioFn({
      data: {
        name: "Lower grocery spend",
        changes: [{ type: "SAVINGS_TARGET", amountPaise: 250_000 }],
      },
    });
    expect((await listScenariosFn({ data: undefined })).map((item) => item.id)).toContain(
      scenario.id,
    );
    role = "VIEWER";
    await prisma.familyMember.update({ where: { id: memberId }, data: { role } });
    await expect(
      createScenarioFn({
        data: { name: "Viewer scenario", changes: [] },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await listScenariosFn({ data: undefined })).map((item) => item.id)).toContain(
      scenario.id,
    );
    role = "OWNER";
    await prisma.familyMember.update({ where: { id: memberId }, data: { role } });
    await renameScenarioFn({ data: { id: scenario.id, name: "Monthly grocery reduction" } });
    expect(
      (await listScenariosFn({ data: undefined })).find((item) => item.id === scenario.id)?.name,
    ).toBe("Monthly grocery reduction");
    await deleteScenarioFn({ data: scenario.id });
    expect(
      (await listScenariosFn({ data: undefined })).some((item) => item.id === scenario.id),
    ).toBe(false);
    const activity = await prisma.activityLog.findMany({
      where: { familyId, entityType: "SCENARIO", entityId: scenario.id },
      orderBy: { createdAt: "asc" },
    });
    expect(activity.map((item) => item.type)).toEqual(["SCENARIO_CREATED", "SCENARIO_DELETED"]);
  });

  it("returns a six-month health trend using shared expenses only", async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await prisma.expense.createMany({
      data: [
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 4_500,
          date: new Date(Date.UTC(year, month - 1, 10, 12)),
          description: "Health trend shared",
          visibility: "SHARED",
        },
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 900_000_000,
          date: new Date(Date.UTC(year, month - 1, 11, 12)),
          description: "Health trend private",
          visibility: "PRIVATE",
        },
      ],
    });
    const expected = await prisma.expense.aggregate({
      where: {
        familyId,
        visibility: "SHARED",
        date: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        },
      },
      _sum: { amountPaise: true },
    });
    const result = await getFinancialHealthFn({ data: undefined });
    expect(result.trend).toHaveLength(6);
    expect(result.trend[5]?.spendPaise).toBe(expected._sum.amountPaise);
  });

  it("creates the same offline expense request only once under concurrent retries", async () => {
    const clientRequestId = crypto.randomUUID();
    const input = {
      amount: 42,
      categoryId,
      date: "2026-10-12",
      description: "Offline retry",
      clientRequestId,
    };
    const results = await Promise.all([
      createExpenseFn({ data: input }),
      createExpenseFn({ data: input }),
    ]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(
      await prisma.expense.count({
        where: { familyId, userId: ownerId, clientRequestId },
      }),
    ).toBe(1);
  });

  it("exports shared rows server-side and includes only this user's private rows on request", async () => {
    const otherUser = await prisma.user.create({
      data: {
        name: "Another planner member",
        email: `planning-other-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    const otherMember = await prisma.familyMember.create({
      data: { familyId, userId: otherUser.id, displayName: otherUser.name, role: "MEMBER" },
    });
    await prisma.expense.create({
      data: {
        familyId,
        userId: otherUser.id,
        memberId: otherMember.id,
        categoryId,
        amountPaise: 50_000,
        date: new Date(),
        description: "Other private health charge",
        visibility: "PRIVATE",
      },
    });
    const matches = await searchExpensesForCommandFn({ data: "private" });
    expect(matches.map((item) => item.description)).toEqual(["Health trend private"]);

    const shared = await exportExpensesFn({ data: { includePrivate: false } });
    expect(shared.csv).toContain("Health trend shared");
    expect(shared.csv).not.toContain("Health trend private");

    const now = new Date();
    const inRangeDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10))
      .toISOString()
      .slice(0, 10);
    const ranged = await exportExpensesFn({
      data: { includePrivate: false, from: inRangeDate, to: inRangeDate },
    });
    expect(ranged.csv).toContain("Health trend shared");
    expect(ranged.csv).not.toContain("Health trend private");
    expect(() =>
      exportExpensesFn({
        data: { includePrivate: false, from: "2026-10-20", to: "2026-10-01" },
      }),
    ).toThrow();

    const personal = await exportExpensesFn({ data: { includePrivate: true } });
    expect(personal.csv).toContain("Health trend private");
    expect(personal.csv).toContain("PRIVATE (mine)");

    for (let request = 0; request < 2; request++) {
      await exportExpensesFn({ data: { includePrivate: false } });
    }
    await expect(exportExpensesFn({ data: { includePrivate: false } })).rejects.toMatchObject({
      statusCode: 429,
    });
    const activity = await prisma.activityLog.findMany({
      where: { familyId, type: "EXPORT_PERFORMED" },
      orderBy: { createdAt: "asc" },
    });
    expect(activity).toHaveLength(5);
    expect(activity[1]?.summary).toMatchObject({ from: inRangeDate, to: inRangeDate });
  });

  it("generates an idempotent money story from shared rows only", async () => {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    await prisma.expense.createMany({
      data: [
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 12_300,
          date: new Date(Date.UTC(year, month - 1, 4, 12)),
          description: "Shared groceries",
          visibility: "SHARED",
        },
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 999_999_999,
          date: new Date(Date.UTC(year, month - 1, 5, 12)),
          description: "Private purchase",
          visibility: "PRIVATE",
        },
      ],
    });
    const first = await generateFamilyStoryFn({ data: { month, year } });
    const second = await generateFamilyStoryFn({ data: { month, year } });
    expect(second.id).toBe(first.id);
    const data = z.object({ totalPaise: z.number(), expenseCount: z.number() }).parse(first.data);
    const rawShared = await prisma.expense.aggregate({
      where: { familyId, visibility: "SHARED" },
      _sum: { amountPaise: true },
      _count: true,
    });
    expect(data.totalPaise).toBe(rawShared._sum.amountPaise);
    expect(data.expenseCount).toBe(rawShared._count);
    const visible = await getFamilyStoryFn({ data: { month, year } });
    expect(visible?.id).toBe(first.id);
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    if (familyId) await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.user.deleteMany({ where: { email: `planning-${suffix}@example.test` } });
  });
});
