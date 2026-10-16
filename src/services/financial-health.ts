import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { listSharedExpenses } from "@/lib/expense-queries";
import { prisma } from "@/lib/prisma";
import { financialHealthScore } from "@/lib/ml/health";

export const getFinancialHealthFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        from: date.toISOString().slice(0, 10),
        label: date.toISOString().slice(0, 7),
      };
    });
    const start = months[0]!;
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const [expenses, budgets, income] = await Promise.all([
      listSharedExpenses(prisma, auth.familyId, { from: start.from, to: end }),
      prisma.budget.findMany({
        where: {
          familyId: auth.familyId,
          OR: months.map(({ year, month }) => ({ year, month })),
        },
        select: { year: true, month: true, totalLimitPaise: true },
      }),
      prisma.incomeProfile.findFirst({
        where: { familyId: auth.familyId },
        select: { monthlyIncomePaise: true },
      }),
    ]);
    const spendByMonth = new Map(months.map(({ year, month }) => [`${year}-${month}`, 0]));
    for (const expense of expenses) {
      const key = `${expense.date.getUTCFullYear()}-${expense.date.getUTCMonth() + 1}`;
      if (spendByMonth.has(key)) {
        spendByMonth.set(key, spendByMonth.get(key)! + expense.amountPaise);
      }
    }
    const budgetByMonth = new Map(
      budgets.map((budget) => [`${budget.year}-${budget.month}`, budget.totalLimitPaise]),
    );
    const trend = months.map(({ year, month, label }) => ({
      month: label,
      spendPaise: spendByMonth.get(`${year}-${month}`) ?? 0,
      budgetPaise: budgetByMonth.get(`${year}-${month}`) ?? 0,
    }));
    const score = financialHealthScore({
      monthlySpendPaise: trend.map(({ spendPaise }) => spendPaise),
      monthlyBudgetPaise: trend.map(({ budgetPaise }) => budgetPaise),
      ...(income ? { monthlyIncomePaise: income.monthlyIncomePaise } : {}),
    });
    return { score, trend };
  });

export function getFinancialHealth() {
  return getFinancialHealthFn({ data: undefined });
}
