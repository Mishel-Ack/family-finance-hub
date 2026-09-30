import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/authz";
import { fromPaise, toPaise } from "@/lib/money";
import type { Budget, BudgetCategory } from "@/types";

export const getBudgetFn = createServerFn({ method: "GET" })
  .validator((d: { month: number; year: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember("readAll");

    const b = await prisma.budget.findUnique({
      where: {
        familyId_month_year: {
          familyId: auth.familyId,
          month: data.month,
          year: data.year,
        },
      },
    });

    if (!b) return null;

    return {
      id: b.id,
      family_id: b.familyId,
      month: b.month,
      year: b.year,
      total_limit_paise: b.totalLimitPaise,
      total_limit: fromPaise(b.totalLimitPaise),
    } as Budget;
  });

export const upsertBudgetFn = createServerFn({ method: "POST" })
  .validator((d: { month: number; year: number; totalLimit: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember("budget:manage");

    if (data.totalLimit <= 0) {
      throw new Error("Total limit must be greater than 0");
    }

    const totalLimitPaise = toPaise(data.totalLimit);

    const b = await prisma.budget.upsert({
      where: {
        familyId_month_year: {
          familyId: auth.familyId,
          month: data.month,
          year: data.year,
        },
      },
      create: {
        familyId: auth.familyId,
        month: data.month,
        year: data.year,
        totalLimitPaise,
      },
      update: {
        totalLimitPaise,
      },
    });

    return {
      id: b.id,
      family_id: b.familyId,
      month: b.month,
      year: b.year,
      total_limit_paise: b.totalLimitPaise,
      total_limit: fromPaise(b.totalLimitPaise),
    } as Budget;
  });

export const deleteBudgetFn = createServerFn({ method: "POST" })
  .validator((budgetId: string) => budgetId)
  .handler(async ({ data: budgetId }) => {
    const auth = await requireMember("budget:manage");

    const b = await prisma.budget.findFirst({
      where: { id: budgetId, familyId: auth.familyId },
    });

    if (!b) {
      throw new Error("Budget not found"); // 404
    }

    await prisma.budget.delete({ where: { id: budgetId } });
  });

export const listBudgetCategoriesFn = createServerFn({ method: "GET" })
  .validator((budgetId: string) => budgetId)
  .handler(async ({ data: budgetId }) => {
    const auth = await requireMember("readAll");

    const b = await prisma.budget.findFirst({
      where: { id: budgetId, familyId: auth.familyId },
    });

    if (!b) {
      throw new Error("Budget not found");
    }

    const cats = await prisma.budgetCategory.findMany({
      where: { budgetId },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    });

    return cats.map(
      (c) =>
        ({
          id: c.id,
          budget_id: c.budgetId,
          category_id: c.categoryId,
          category_name: c.category?.name ?? "Category",
          category_color: c.category?.color ?? "#6b7280",
          category_icon: c.category?.icon ?? "Tag",
          category: c.category?.name ?? "Category",
          limit_amount_paise: c.limitAmountPaise,
          limit_amount: fromPaise(c.limitAmountPaise),
        }) as BudgetCategory,
    );
  });

export const upsertBudgetCategoryFn = createServerFn({ method: "POST" })
  .validator((d: { budgetId: string; categoryId: string; limitAmount: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember("budget:manage");

    const b = await prisma.budget.findFirst({
      where: { id: data.budgetId, familyId: auth.familyId },
    });

    if (!b) {
      throw new Error("Budget not found");
    }

    if (data.limitAmount <= 0) {
      throw new Error("Category limit must be greater than 0");
    }

    const limitAmountPaise = toPaise(data.limitAmount);

    await prisma.budgetCategory.upsert({
      where: {
        budgetId_categoryId: {
          budgetId: data.budgetId,
          categoryId: data.categoryId,
        },
      },
      create: {
        budgetId: data.budgetId,
        categoryId: data.categoryId,
        limitAmountPaise,
      },
      update: {
        limitAmountPaise,
      },
    });
  });

export const deleteBudgetCategoryFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const auth = await requireMember("budget:manage");

    const bc = await prisma.budgetCategory.findFirst({
      where: { id, budget: { familyId: auth.familyId } },
    });

    if (!bc) {
      throw new Error("Budget category not found");
    }

    await prisma.budgetCategory.delete({ where: { id } });
  });

// Export client functions
export function getBudget(month: number, year: number) {
  return getBudgetFn({ data: { month, year } });
}

export function upsertBudget(month: number, year: number, totalLimit: number) {
  return upsertBudgetFn({ data: { month, year, totalLimit } });
}

export function deleteBudget(budgetId: string) {
  return deleteBudgetFn({ data: budgetId });
}

export function listBudgetCategories(budgetId: string) {
  return listBudgetCategoriesFn({ data: budgetId });
}

export function upsertBudgetCategory(budgetId: string, categoryId: string, limitAmount: number) {
  return upsertBudgetCategoryFn({ data: { budgetId, categoryId, limitAmount } });
}

export function deleteBudgetCategory(id: string) {
  return deleteBudgetCategoryFn({ data: id });
}