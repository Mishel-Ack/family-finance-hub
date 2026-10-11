import { createServerFn } from "@tanstack/react-start";
import { Prisma, type Expense } from "@prisma/client";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { prisma } from "@/lib/prisma";
import { listSharedExpenses } from "@/lib/expense-queries";

const periodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2200),
});
const startOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function summarize(
  expenses: Expense[],
  categories: Array<{ id: string; name: string }>,
  budgetPaise: number,
) {
  const totalPaise = expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
  const categoryTotals = new Map<string, number>();
  for (const expense of expenses)
    categoryTotals.set(
      expense.categoryId,
      (categoryTotals.get(expense.categoryId) ?? 0) + expense.amountPaise,
    );
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoryId, amountPaise]) => ({
      name: names.get(categoryId) ?? "Archived category",
      amountPaise,
    }));
  const biggest = expenses.reduce<Expense | null>(
    (previous, expense) =>
      !previous || expense.amountPaise > previous.amountPaise ? expense : previous,
    null,
  );
  const spentByMember = new Map<string, number>();
  for (const expense of expenses) {
    const label =
      expense.memberNameSnapshot && !expense.memberId
        ? `Former member (${expense.memberNameSnapshot})`
        : expense.memberIdSnapshot && expense.memberNameSnapshot
          ? `Former member (${expense.memberNameSnapshot})`
          : (expense.memberId ?? "Unassigned");
    spentByMember.set(label, (spentByMember.get(label) ?? 0) + expense.amountPaise);
  }
  return {
    totalPaise,
    expenseCount: expenses.length,
    topCategories,
    budgetPaise,
    remainingPaise: budgetPaise - totalPaise,
    biggestExpense: biggest
      ? {
          amountPaise: biggest.amountPaise,
          date: isoDate(biggest.date),
          description: biggest.description,
        }
      : null,
    spendingByMember: [...spentByMember.entries()].map(([member, amountPaise]) => ({
      member,
      amountPaise,
    })),
  } satisfies Prisma.InputJsonObject;
}

export const getFamilyStoryFn = createServerFn({ method: "GET" })
  .validator(periodSchema)
  .handler(async ({ data }) => {
    const auth = await requireMember("readAll");
    return prisma.monthlyReport.findFirst({
      where: { familyId: auth.familyId, month: data.month, year: data.year },
    });
  });

export const generateFamilyStoryFn = createServerFn({ method: "POST" })
  .validator(periodSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("report:generate");
    const start = startOfMonth(data.year, data.month);
    const previous = startOfMonth(data.year, data.month - 1);
    const end = startOfMonth(data.year, data.month + 1);
    const [currentRows, previousRows, budget, categories] = await Promise.all([
      listSharedExpenses(prisma, auth.familyId, { from: isoDate(start) }),
      listSharedExpenses(prisma, auth.familyId, { from: isoDate(previous) }),
      prisma.budget.findFirst({
        where: { familyId: auth.familyId, month: data.month, year: data.year },
        select: { totalLimitPaise: true },
      }),
      prisma.category.findMany({
        where: { familyId: auth.familyId },
        select: { id: true, name: true },
      }),
    ]);
    const currentExpenses = currentRows.filter((expense) => expense.date < end);
    const previousExpenses = previousRows.filter((expense) => expense.date < start);
    const current = summarize(currentExpenses, categories, budget?.totalLimitPaise ?? 0);
    const priorTotal = previousExpenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
    const storedData: Prisma.InputJsonObject = {
      ...current,
      previousMonthTotalPaise: priorTotal,
      changePaise: current.totalPaise - priorTotal,
    };
    const narrative =
      current.expenseCount === 0
        ? "There were no shared expenses recorded this month."
        : "This story summarizes the family’s shared spending for the month.";
    return prisma.monthlyReport.upsert({
      where: {
        familyId_month_year: { familyId: auth.familyId, month: data.month, year: data.year },
      },
      create: {
        familyId: auth.familyId,
        month: data.month,
        year: data.year,
        data: storedData,
        narrative,
      },
      update: { data: storedData, narrative, generatedAt: new Date() },
    });
  });

export function getFamilyStory(month: number, year: number) {
  return getFamilyStoryFn({ data: { month, year } });
}
export function generateFamilyStory(month: number, year: number) {
  return generateFamilyStoryFn({ data: { month, year } });
}
