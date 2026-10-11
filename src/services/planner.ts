import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { listSharedExpenses } from "@/lib/expense-queries";
import { prisma } from "@/lib/prisma";
import { simulateScenario, type ScenarioChange } from "@/lib/ml/simulate";

const scenarioChangeSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("REDUCE_CATEGORY"),
      categoryId: z.string().uuid(),
      percent: z.number().min(0).max(100),
      fromMonth: z.number().int().min(0).max(11).optional(),
    }),
    z.object({
      type: z.literal("RECURRING_EXPENSE"),
      categoryId: z.string().uuid(),
      amountPaise: z.number().int().positive().max(1_000_000_000),
      startMonth: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("ONE_OFF_EXPENSE"),
      categoryId: z.string().uuid(),
      amountPaise: z.number().int().positive().max(1_000_000_000),
      month: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("INCOME_CHANGE"),
      amountPaise: z.number().int().max(1_000_000_000).min(-1_000_000_000),
      fromMonth: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("SAVINGS_TARGET"),
      amountPaise: z.number().int().positive().max(10_000_000_000),
    }),
  ])
  .array()
  .max(12);

export const runPlannerFn = createServerFn({ method: "POST" })
  .validator(scenarioChangeSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("planner:run");
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
    const [expenses, income, budgets, categories] = await Promise.all([
      listSharedExpenses(prisma, auth.familyId, { from: start.toISOString().slice(0, 10) }),
      prisma.incomeProfile.findFirst({
        where: { familyId: auth.familyId },
        select: { monthlyIncomePaise: true },
      }),
      prisma.budget.findFirst({
        where: {
          familyId: auth.familyId,
          month: now.getUTCMonth() + 1,
          year: now.getUTCFullYear(),
        },
        select: { totalLimitPaise: true },
      }),
      prisma.category.findMany({
        where: { familyId: auth.familyId, archivedAt: null },
        select: { id: true },
      }),
    ]);
    const months = Array.from(
      { length: 6 },
      (_, offset) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1)),
    );
    const historyByCategory: Record<string, number[]> = Object.fromEntries(
      categories.map(({ id }) => [id, months.map(() => 0)]),
    );
    for (const expense of expenses) {
      const index = months.findIndex(
        (month) =>
          month.getUTCFullYear() === expense.date.getUTCFullYear() &&
          month.getUTCMonth() === expense.date.getUTCMonth(),
      );
      const categoryHistory = historyByCategory[expense.categoryId];
      if (index >= 0 && categoryHistory) categoryHistory[index] = (categoryHistory[index] ?? 0) + expense.amountPaise;
    }
    return simulateScenario({
      historyByCategory,
      changes: data as ScenarioChange[],
      ...(income ? { monthlyIncomePaise: income.monthlyIncomePaise } : {}),
      ...(budgets ? { budgetByMonth: Array(12).fill(budgets.totalLimitPaise) as number[] } : {}),
      seed: now.getUTCFullYear() * 100 + now.getUTCMonth() + 1,
    });
  });

export function runPlanner(changes: ScenarioChange[]) {
  return runPlannerFn({ data: changes });
}
