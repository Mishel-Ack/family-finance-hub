import { prisma } from "@/lib/prisma";
import type { Expense, ExpenseInput } from "@/types";

export async function listExpenses(familyId: string, from?: string, to?: string): Promise<Expense[]> {
  const whereClause: any = { familyId };
  if (from || to) {
    whereClause.date = {};
    if (from) whereClause.date.gte = new Date(from);
    if (to) whereClause.date.lte = new Date(to);
  }

  const items = await prisma.expense.findMany({
    where: whereClause,
    orderBy: { date: "desc" },
  });

  return items.map((e) => ({
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
  }));
}

export async function createExpense(familyId: string, userId: string, input: ExpenseInput) {
  await prisma.expense.create({
    data: {
      familyId,
      userId,
      amount: input.amount,
      category: input.category,
      date: new Date(input.date),
      description: input.description ?? "",
      familyMember: input.familyMember ?? "",
    },
  });
}

export async function updateExpense(id: string, input: ExpenseInput) {
  await prisma.expense.update({
    where: { id },
    data: {
      amount: input.amount,
      category: input.category,
      date: new Date(input.date),
      description: input.description ?? "",
      familyMember: input.familyMember ?? "",
    },
  });
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
}