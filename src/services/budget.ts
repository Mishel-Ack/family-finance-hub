import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import type { Budget, BudgetCategory } from "@/types";

export const getBudgetFn = createServerFn({ method: "GET" })
  .validator((d: { familyId: string; month: number; year: number }) => d)
  .handler(async ({ data }) => {
    const b = await prisma.budget.findUnique({
      where: {
        familyId_month_year: {
          familyId: data.familyId,
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
      total_limit: b.totalLimit,
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
    } as Budget;
  });

export const upsertBudgetFn = createServerFn({ method: "POST" })
  .validator((d: { familyId: string; month: number; year: number; totalLimit: number }) => d)
  .handler(async ({ data }) => {
    const b = await prisma.budget.upsert({
      where: {
        familyId_month_year: {
          familyId: data.familyId,
          month: data.month,
          year: data.year,
        },
      },
      create: {
        familyId: data.familyId,
        month: data.month,
        year: data.year,
        totalLimit: data.totalLimit,
      },
      update: {
        totalLimit: data.totalLimit,
      },
    });

    return {
      id: b.id,
      family_id: b.familyId,
      month: b.month,
      year: b.year,
      total_limit: b.totalLimit,
      created_at: b.createdAt.toISOString(),
      updated_at: b.updatedAt.toISOString(),
    } as Budget;
  });

export const deleteBudgetFn = createServerFn({ method: "POST" })
  .validator((budgetId: string) => budgetId)
  .handler(async ({ data: budgetId }) => {
    await prisma.budget.delete({ where: { id: budgetId } });
  });

export const listBudgetCategoriesFn = createServerFn({ method: "GET" })
  .validator((budgetId: string) => budgetId)
  .handler(async ({ data: budgetId }) => {
    const cats = await prisma.budgetCategory.findMany({
      where: { budgetId },
      orderBy: { category: "asc" },
    });

    return cats.map(
      (c) =>
        ({
          id: c.id,
          budget_id: c.budgetId,
          category: c.category,
          limit_amount: c.limitAmount,
          created_at: c.createdAt.toISOString(),
          updated_at: c.updatedAt.toISOString(),
        }) as BudgetCategory,
    );
  });

export const upsertBudgetCategoryFn = createServerFn({ method: "POST" })
  .validator((d: { budgetId: string; category: string; limitAmount: number }) => d)
  .handler(async ({ data }) => {
    await prisma.budgetCategory.upsert({
      where: {
        budgetId_category: {
          budgetId: data.budgetId,
          category: data.category,
        },
      },
      create: {
        budgetId: data.budgetId,
        category: data.category,
        limitAmount: data.limitAmount,
      },
      update: {
        limitAmount: data.limitAmount,
      },
    });
  });

export const deleteBudgetCategoryFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await prisma.budgetCategory.delete({ where: { id } });
  });

// Export client functions
export function getBudget(familyId: string, month: number, year: number) {
  return getBudgetFn({ data: { familyId, month, year } });
}

export function upsertBudget(familyId: string, month: number, year: number, totalLimit: number) {
  return upsertBudgetFn({ data: { familyId, month, year, totalLimit } });
}

export function deleteBudget(budgetId: string) {
  return deleteBudgetFn({ data: budgetId });
}

export function listBudgetCategories(budgetId: string) {
  return listBudgetCategoriesFn({ data: budgetId });
}

export function upsertBudgetCategory(budgetId: string, category: string, limitAmount: number) {
  return upsertBudgetCategoryFn({ data: { budgetId, category, limitAmount } });
}

export function deleteBudgetCategory(id: string) {
  return deleteBudgetCategoryFn({ data: id });
}