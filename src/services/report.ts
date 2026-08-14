import { getBudget, listBudgetCategories } from "./budget";
import { listExpenses } from "./expense";
import { CATEGORIES } from "@/lib/constants";
import { statusFor, usagePercent } from "@/lib/calculations";
import type { Expense } from "@/types";

export function monthRange(month: number, year: number) {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export interface CategoryBreakdown {
  category: string;
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
  totalLimit: number;
  totalSpent: number;
  remaining: number;
  percent: number;
  status: ReturnType<typeof statusFor>;
  expenseCount: number;
  expenses: Expense[];
  categories: CategoryBreakdown[];
  allocated: number;
}

export async function getMonthlySummary(
  familyId: string,
  month: number,
  year: number,
): Promise<MonthlySummary> {
  const { from, to } = monthRange(month, year);
  const budget = await getBudget(familyId, month, year);
  const [categories, expenses] = await Promise.all([
    budget ? listBudgetCategories(budget.id) : Promise.resolve([]),
    listExpenses(familyId, from, to),
  ]);

  const totalLimit = Number(budget?.total_limit ?? 0);
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const percent = usagePercent(totalSpent, totalLimit);

  const spentByCategory = new Map<string, number>();
  for (const e of expenses) {
    spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  const known = new Set<string>([...CATEGORIES, ...categories.map((c) => c.category)]);
  const breakdown: CategoryBreakdown[] = [...known].map((category) => {
    const limit = Number(categories.find((c) => c.category === category)?.limit_amount ?? 0);
    const spent = spentByCategory.get(category) ?? 0;
    const pct = usagePercent(spent, limit);
    return {
      category,
      limit,
      spent,
      remaining: limit - spent,
      percent: pct,
      status: statusFor(pct),
    };
  });

  return {
    month,
    year,
    budgetId: budget?.id ?? null,
    totalLimit,
    totalSpent,
    remaining: totalLimit - totalSpent,
    percent,
    status: statusFor(percent),
    expenseCount: expenses.length,
    expenses,
    categories: breakdown,
    allocated: categories.reduce((s, c) => s + Number(c.limit_amount), 0),
  };
}

export async function getYearlyTrend(familyId: string, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const expenses = await listExpenses(familyId, from, to);
  const totals = Array.from({ length: 12 }, () => 0);
  for (const e of expenses) {
    const m = Number(e.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) totals[m] = (totals[m] ?? 0) + Number(e.amount);
  }
  return totals;
}