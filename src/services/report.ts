import { createServerFn } from "@tanstack/react-start";
import { getBudget, listBudgetCategories } from "./budget";
import { listExpenses } from "./expense";
import { listCategories } from "./category";
import { statusFor, usagePercent } from "@/lib/calculations";
import { fromPaise } from "@/lib/money";
import type { Expense } from "@/types";
import { idSchema, monthYearSchema, yearSchema } from "@/lib/validations";
import { z } from "zod";

const monthlyReportSchema = monthYearSchema.extend({ memberId: idSchema.optional() });
const yearlyReportSchema = z.union([
  yearSchema,
  z.object({ year: yearSchema, memberId: idSchema.optional() }),
]);

export function monthRange(month: number, year: number) {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export interface CategoryBreakdown {
  category: string;
  categoryId: string;
  color: string;
  icon: string;
  limitPaise: number;
  spentPaise: number;
  remainingPaise: number;
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  status: ReturnType<typeof statusFor>;
}

export interface MonthlySummary {
  month: number;
  year: number;
  budgetId: string | null;
  totalLimitPaise: number;
  totalSpentPaise: number;
  remainingPaise: number;
  allocatedPaise: number;
  totalLimit: number;
  totalSpent: number;
  remaining: number;
  percent: number;
  status: ReturnType<typeof statusFor>;
  expenseCount: number;
  expenses: Expense[];
  categories: CategoryBreakdown[];
  allocated: number;
  spendingByMember: Array<{
    memberId: string | null;
    memberName: string;
    amountPaise: number;
    amount: number;
  }>;
}

export const getMonthlySummaryFn = createServerFn({ method: "GET" })
  .validator(monthlyReportSchema)
  .handler(async ({ data: { month, year, memberId } }): Promise<MonthlySummary> => {
    const { from, to } = monthRange(month, year);
    const [budget, familyCategories, allExpenses] = await Promise.all([
      getBudget(month, year),
      listCategories(),
      listExpenses(from, to, "SHARED"),
    ]);
    const expenses = memberId
      ? allExpenses.filter(
          (expense) => expense.member_id === memberId || expense.member_id_snapshot === memberId,
        )
      : allExpenses;

    const budgetCategories = budget ? await listBudgetCategories(budget.id) : [];

    const totalLimitPaise = budget?.total_limit_paise ?? 0;
    const totalSpentPaise = expenses.reduce((sum, e) => sum + (e.amount_paise ?? 0), 0);
    const percent = usagePercent(totalSpentPaise, totalLimitPaise);

    const spentByCategoryId = new Map<string, number>();
    for (const e of expenses) {
      const current = spentByCategoryId.get(e.category_id) ?? 0;
      spentByCategoryId.set(e.category_id, current + (e.amount_paise ?? 0));
    }

    const breakdown: CategoryBreakdown[] = familyCategories.map((c) => {
      const budgetCat = budgetCategories.find((b) => b.category_id === c.id);
      const limitPaise = budgetCat?.limit_amount_paise ?? 0;
      const spentPaise = spentByCategoryId.get(c.id) ?? 0;
      const pct = usagePercent(spentPaise, limitPaise);

      return {
        category: c.name,
        categoryId: c.id,
        color: c.color,
        icon: c.icon,
        limitPaise,
        spentPaise,
        remainingPaise: limitPaise - spentPaise,
        limit: fromPaise(limitPaise),
        spent: fromPaise(spentPaise),
        remaining: fromPaise(limitPaise - spentPaise),
        percent: pct,
        status: statusFor(pct),
      };
    });

    const allocatedPaise = budgetCategories.reduce((s, c) => s + (c.limit_amount_paise ?? 0), 0);
    const membersById = new Map<
      string,
      { memberId: string | null; memberName: string; amountPaise: number }
    >();
    for (const expense of expenses) {
      const formerId = expense.member_id_snapshot ?? null;
      const hasFormerName = !expense.member_id && Boolean(expense.member_name_snapshot);
      const key =
        expense.member_id ??
        formerId ??
        (hasFormerName ? `former:${expense.member_name_snapshot}` : "__unassigned__");
      const current = membersById.get(key);
      const memberName =
        formerId || hasFormerName
          ? `Former member (${expense.member_name_snapshot || "Unknown"})`
          : expense.member_id
            ? expense.family_member || "Family member"
            : "Unassigned";
      membersById.set(key, {
        memberId: expense.member_id ?? formerId,
        memberName,
        amountPaise: (current?.amountPaise ?? 0) + (expense.amount_paise ?? 0),
      });
    }

    return {
      month,
      year,
      budgetId: budget?.id ?? null,
      totalLimitPaise,
      totalSpentPaise,
      remainingPaise: totalLimitPaise - totalSpentPaise,
      allocatedPaise,
      totalLimit: fromPaise(totalLimitPaise),
      totalSpent: fromPaise(totalSpentPaise),
      remaining: fromPaise(totalLimitPaise - totalSpentPaise),
      percent,
      status: statusFor(percent),
      expenseCount: expenses.length,
      expenses,
      categories: breakdown,
      allocated: fromPaise(allocatedPaise),
      spendingByMember: [...membersById.values()].map((member) => ({
        ...member,
        amount: fromPaise(member.amountPaise),
      })),
    };
  });

export const getYearlyTrendFn = createServerFn({ method: "GET" })
  .validator(yearlyReportSchema)
  .handler(async ({ data }) => {
    const year = typeof data === "number" ? data : data.year;
    const memberId = typeof data === "number" ? undefined : data.memberId;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const allExpenses = await listExpenses(from, to, "SHARED");
    const expenses = memberId
      ? allExpenses.filter(
          (expense) => expense.member_id === memberId || expense.member_id_snapshot === memberId,
        )
      : allExpenses;
    const totalsPaise = Array.from({ length: 12 }, () => 0);
    for (const e of expenses) {
      const m = Number(e.date.slice(5, 7)) - 1;
      if (m >= 0 && m < 12) {
        totalsPaise[m] = (totalsPaise[m] ?? 0) + (e.amount_paise ?? 0);
      }
    }
    return totalsPaise.map((p) => fromPaise(p));
  });

export function getMonthlySummary(month: number, year: number, memberId?: string) {
  return getMonthlySummaryFn({ data: { month, year, memberId } });
}

export function getYearlyTrend(year: number, memberId?: string) {
  return getYearlyTrendFn({ data: { year, memberId } });
}
