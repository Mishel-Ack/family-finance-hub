import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import type { Expense, ExpenseInput } from "@/types";

export const listExpensesFn = createServerFn({ method: "GET" })
  .validator((d: { familyId: string; from?: string; to?: string }) => d)
  .handler(async ({ data }) => {
    const whereClause: any = { familyId: data.familyId };
    if (data.from || data.to) {
      whereClause.date = {};
      if (data.from) whereClause.date.gte = new Date(data.from);
      if (data.to) whereClause.date.lte = new Date(data.to);
    }

    const items = await prisma.expense.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
    });

    return items.map(
      (e) =>
        ({
          id: e.id,
          family_id: e.familyId,
          user_id: e.userId,
          amount: e.amount,
          category: e.category,
          date: e.date.toISOString().slice(0, 10),
          description: e.description,
          family_member: e.familyMember,
          created_at: e.createdAt.toISOString(),
          updated_at: e.updatedAt.toISOString(),
        }) as Expense,
    );
  });

export const createExpenseFn = createServerFn({ method: "POST" })
  .validator((d: { familyId: string; userId: string; input: ExpenseInput }) => d)
  .handler(async ({ data }) => {
    await prisma.expense.create({
      data: {
        familyId: data.familyId,
        userId: data.userId,
        amount: data.input.amount,
        category: data.input.category,
        date: new Date(data.input.date),
        description: data.input.description ?? "",
        familyMember: data.input.familyMember ?? "",
      },
    });
  });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; input: ExpenseInput }) => d)
  .handler(async ({ data }) => {
    await prisma.expense.update({
      where: { id: data.id },
      data: {
        amount: data.input.amount,
        category: data.input.category,
        date: new Date(data.input.date),
        description: data.input.description ?? "",
        familyMember: data.input.familyMember ?? "",
      },
    });
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await prisma.expense.delete({ where: { id } });
  });

// Export client functions
export function listExpenses(familyId: string, from?: string, to?: string) {
  return listExpensesFn({ data: { familyId, from, to } });
}

export function createExpense(familyId: string, userId: string, input: ExpenseInput) {
  return createExpenseFn({ data: { familyId, userId, input } });
}

export function updateExpense(id: string, input: ExpenseInput) {
  return updateExpenseFn({ data: { id, input } });
}

export function deleteExpense(id: string) {
  return deleteExpenseFn({ data: id });
}