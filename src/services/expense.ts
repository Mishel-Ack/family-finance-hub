import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember, can } from "@/lib/authz";
import { fromPaise, toPaise } from "@/lib/money";
import type { Expense, ExpenseInput } from "@/types";

export const listExpensesFn = createServerFn({ method: "GET" })
  .validator((d?: { from?: string; to?: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember("readAll");

    const whereClause: any = { familyId: auth.familyId };
    if (data?.from || data?.to) {
      whereClause.date = {};
      if (data.from) whereClause.date.gte = new Date(data.from);
      if (data.to) whereClause.date.lte = new Date(data.to);
    }

    const items = await prisma.expense.findMany({
      where: whereClause,
      include: {
        category: true,
        member: true,
      },
      orderBy: { date: "desc" },
    });

    return items.map(
      (e) =>
        ({
          id: e.id,
          family_id: e.familyId,
          user_id: e.userId,
          member_id: e.memberId,
          amount_paise: e.amountPaise,
          amount: fromPaise(e.amountPaise),
          category_id: e.categoryId,
          category_name: e.category?.name ?? "General",
          category_color: e.category?.color ?? "#6b7280",
          category_icon: e.category?.icon ?? "Tag",
          category: e.category?.name ?? "General",
          date: e.date.toISOString().slice(0, 10),
          description: e.description,
          family_member: e.member?.displayName ?? "",
          created_at: e.createdAt.toISOString(),
        }) as Expense,
    );
  });

export const createExpenseFn = createServerFn({ method: "POST" })
  .validator((input: ExpenseInput) => input)
  .handler(async ({ data }) => {
    const auth = await requireMember("expense:create");

    if (data.amount <= 0) {
      throw new Error("Expense amount must be greater than 0");
    }

    const amountPaise = toPaise(data.amount);

    let memberId: string | null = data.memberId ?? null;
    if (!memberId) {
      memberId = auth.memberId;
    }

    await prisma.expense.create({
      data: {
        familyId: auth.familyId,
        userId: auth.userId,
        memberId,
        categoryId: data.categoryId,
        amountPaise,
        date: new Date(data.date),
        description: data.description ?? "",
      },
    });
  });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; input: ExpenseInput }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember();

    const existing = await prisma.expense.findFirst({
      where: { id: data.id, familyId: auth.familyId },
    });

    if (!existing) {
      throw new Error("Expense not found"); // 404 behavior for isolation
    }

    // Check authorization: editAny or editOwn
    const isOwnerOfExpense = existing.userId === auth.userId;
    if (isOwnerOfExpense) {
      if (!can(auth.role, "expense:editOwn") && !can(auth.role, "expense:editAny")) {
        throw new Error("Forbidden: Cannot edit this expense");
      }
    } else {
      if (!can(auth.role, "expense:editAny")) {
        throw new Error("Forbidden: Cannot edit other members' expenses");
      }
    }

    if (data.input.amount <= 0) {
      throw new Error("Expense amount must be greater than 0");
    }

    await prisma.expense.update({
      where: { id: data.id },
      data: {
        amountPaise: toPaise(data.input.amount),
        categoryId: data.input.categoryId,
        memberId: data.input.memberId ?? existing.memberId,
        date: new Date(data.input.date),
        description: data.input.description ?? "",
      },
    });
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const auth = await requireMember();

    const existing = await prisma.expense.findFirst({
      where: { id, familyId: auth.familyId },
    });

    if (!existing) {
      throw new Error("Expense not found"); // 404 behavior
    }

    const isOwnerOfExpense = existing.userId === auth.userId;
    if (isOwnerOfExpense) {
      if (!can(auth.role, "expense:deleteOwn") && !can(auth.role, "expense:deleteAny")) {
        throw new Error("Forbidden: Cannot delete this expense");
      }
    } else {
      if (!can(auth.role, "expense:deleteAny")) {
        throw new Error("Forbidden: Cannot delete other members' expenses");
      }
    }

    await prisma.expense.delete({ where: { id } });
  });

// Client helper wrappers
export function listExpenses(from?: string, to?: string) {
  return listExpensesFn({ data: { from, to } });
}

export function createExpense(input: ExpenseInput) {
  return createExpenseFn({ data: input });
}

export function updateExpense(id: string, input: ExpenseInput) {
  return updateExpenseFn({ data: { id, input } });
}

export function deleteExpense(id: string) {
  return deleteExpenseFn({ data: id });
}