import { prisma } from "@/lib/prisma";
import type { Budget, BudgetCategory } from "@/types";

export async function getBudget(familyId: string, month: number, year: number): Promise<Budget | null> {
  const b = await prisma.budget.findUnique({
    where: {
      familyId_month_year: {
        familyId,
        month,
        year,
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
  };
}

export async function upsertBudget(
  familyId: string,
  month: number,
  year: number,
  totalLimit: number,
): Promise<Budget> {
  const b = await prisma.budget.upsert({
    where: {
      familyId_month_year: {
        familyId,
        month,
        year,
      },
    },
    create: {
      familyId,
      month,
      year,
      totalLimit,
    },
    update: {
      totalLimit,
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
  };
}

export async function deleteBudget(budgetId: string) {
  await prisma.budget.delete({ where: { id: budgetId } });
}

export async function listBudgetCategories(budgetId: string): Promise<BudgetCategory[]> {
  const cats = await prisma.budgetCategory.findMany({
    where: { budgetId },
    orderBy: { category: "asc" },
  });

  return cats.map((c) => ({
    id: c.id,
    budget_id: c.budgetId,
    category: c.category,
    limit_amount: c.limitAmount,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  }));
}

export async function upsertBudgetCategory(
  budgetId: string,
  category: string,
  limitAmount: number,
) {
  await prisma.budgetCategory.upsert({
    where: {
      budgetId_category: {
        budgetId,
        category,
      },
    },
    create: {
      budgetId,
      category,
      limitAmount,
    },
    update: {
      limitAmount,
    },
  });
}

export async function deleteBudgetCategory(id: string) {
  await prisma.budgetCategory.delete({ where: { id } });
}