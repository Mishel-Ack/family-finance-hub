import { afterAll, describe, expect, it, vi } from "vitest";

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
import { setAuthResolverForTests } from "@/lib/authz";
import { getFamilyBalances } from "@/services/balances";
import { getMonthlySummaryFn } from "@/services/report";
import { getInviteDetailsFn } from "@/services/invites";
import { backtestPlanningEngine } from "@/lib/ml/backtest";
import {
  DEMO_FAMILY_ID,
  DEMO_INVITE_TOKEN,
  disconnectDemoSeed,
  LARGE_SEED_OUTLIER_INDEXES,
  seedDemo,
  stableId,
} from "../scripts/seed-demo.ts";

describe("demo seed integration", () => {
  it("refuses production and unapproved remote targets", async () => {
    const previousUrl = process.env["DATABASE_URL"];
    const previousEnvironment = process.env["NODE_ENV"];
    const previousRemoteFlag = process.env["ALLOW_DEMO_SEED"];
    try {
      process.env["NODE_ENV"] = "test";
      process.env["DATABASE_URL"] = "postgresql://unused:unused@db.example.invalid/family_budget";
      delete process.env["ALLOW_DEMO_SEED"];
      await expect(seedDemo([])).rejects.toThrow("Remote demo seeding requires");
      await expect(seedDemo(["--force-remote"])).rejects.toThrow("Remote demo seeding requires");

      process.env["NODE_ENV"] = "production";
      process.env["DATABASE_URL"] = "postgresql://unused:unused@localhost/family_budget";
      await expect(seedDemo([])).rejects.toThrow("disabled in production");
    } finally {
      if (previousUrl === undefined) delete process.env["DATABASE_URL"];
      else process.env["DATABASE_URL"] = previousUrl;
      if (previousEnvironment === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = previousEnvironment;
      if (previousRemoteFlag === undefined) delete process.env["ALLOW_DEMO_SEED"];
      else process.env["ALLOW_DEMO_SEED"] = previousRemoteFlag;
    }
  });

  it("is idempotent, keeps split balances zero-sum, and excludes private rows from reports", async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ActivityLog", "ExpenseSplit", "Settlement", "Invite", "Expense", "BudgetCategory", "Budget", "Category", "FamilyMember", "Family", "User" CASCADE',
    );
    const first = await seedDemo(["--large"]);
    const second = await seedDemo(["--large"]);
    expect(second).toEqual(first);
    expect(second.familyId).toBe(DEMO_FAMILY_ID);
    expect(second.counts.expenses).toBe(400);
    const seedRows = await prisma.expense.findMany({
      where: { familyId: second.familyId, visibility: "SHARED" },
      select: { id: true, categoryId: true, description: true, amountPaise: true, date: true },
    });
    const monthTotals = new Map<string, Record<string, number>>();
    for (const expense of seedRows) {
      const month = expense.date.toISOString().slice(0, 7);
      const categoriesForMonth = monthTotals.get(month) ?? {};
      categoriesForMonth[expense.categoryId] =
        (categoriesForMonth[expense.categoryId] ?? 0) + expense.amountPaise;
      monthTotals.set(month, categoriesForMonth);
    }
    const backtest = backtestPlanningEngine({
      months: [...monthTotals]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, categories]) => ({ month, categories })),
      expenses: seedRows.map((expense) => ({
        id: expense.id,
        categoryId: expense.categoryId,
        merchant: expense.description,
        amountPaise: expense.amountPaise,
        date: expense.date.toISOString().slice(0, 10),
      })),
      seededOutlierExpenseIds: LARGE_SEED_OUTLIER_INDEXES.map((index) =>
        stableId(`expense:large:${index}`),
      ),
    });
    console.info(
      `Large-seed backtest: ${JSON.stringify({ mapePercent: backtest.mapePercent, maePaise: backtest.maePaise, anomaly: backtest.anomaly })}`,
    );
    expect(backtest.rows).toHaveLength(4);
    expect(backtest.mapePercent).not.toBeNull();
    expect(backtest.anomaly.recall).toBe(1);
    expect(
      backtest.anomaly.predictedCount - backtest.anomaly.truePositiveCount,
    ).toBeLessThanOrEqual(15);
    expect(await getInviteDetailsFn({ data: DEMO_INVITE_TOKEN })).toMatchObject({
      familyName: "Sharma Family",
      role: "MEMBER",
    });

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "demo-owner@example.com" },
    });
    const membership = await prisma.familyMember.findUniqueOrThrow({ where: { userId: owner.id } });
    setAuthResolverForTests(async () => ({
      userId: owner.id,
      familyId: membership.familyId,
      memberId: membership.id,
      role: "OWNER",
      user: { id: owner.id, name: owner.name, email: owner.email },
    }));

    const { balances } = await getFamilyBalances(prisma, membership.familyId);
    expect([...balances.values()].reduce((sum, amount) => sum + amount, 0)).toBe(0);
    expect([...balances.values()].some((amount) => amount !== 0)).toBe(true);
    const privateCount = await prisma.expense.count({
      where: { familyId: membership.familyId, visibility: "PRIVATE" },
    });
    expect(privateCount).toBeGreaterThan(0);

    const months = await prisma.budget.findMany({ where: { familyId: membership.familyId } });
    for (const month of months) {
      const report = await getMonthlySummaryFn({ data: { month: month.month, year: month.year } });
      const expectedSharedCount = await prisma.expense.count({
        where: {
          familyId: membership.familyId,
          visibility: "SHARED",
          date: {
            gte: new Date(Date.UTC(month.year, month.month - 1, 1)),
            lt: new Date(Date.UTC(month.year, month.month, 1)),
          },
        },
      });
      expect(report.expenseCount).toBe(expectedSharedCount);
      expect(report.expenses.every((expense) => expense.visibility === "SHARED")).toBe(true);
    }
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ActivityLog", "ExpenseSplit", "Settlement", "Invite", "Expense", "BudgetCategory", "Budget", "Category", "FamilyMember", "Family", "User" CASCADE',
    );
    await prisma.$disconnect();
    await disconnectDemoSeed();
  });
});
