import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, can } from "@/lib/authz";
import { fromPaise, toPaise } from "@/lib/money";
import type { Expense, ExpenseInput } from "@/types";
import { expenseSchema } from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";

export const listExpensesFn = createServerFn({ method: "GET" })
  .validator((d?: { from?: string | undefined; to?: string | undefined }) => d)
  .handler(async ({ data }) => {
    const auth = await requireMember("readAll");

    const whereClause: Prisma.ExpenseWhereInput = { familyId: auth.familyId };
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
  .validator(expenseSchema)
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

    const [category, member] = await Promise.all([
      prisma.category.findFirst({
        where: { id: data.categoryId, familyId: auth.familyId, archivedAt: null },
      }),
      prisma.familyMember.findFirst({ where: { id: memberId, familyId: auth.familyId } }),
    ]);
    if (!category) throw notFound("Category not found");
    if (!member) throw notFound("Family member not found");

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
  .validator(z.object({ id: z.string().min(1), input: expenseSchema }))
  .handler(async ({ data }) => {
    const auth = await requireMember();

    const existing = await prisma.expense.findFirst({
      where: { id: data.id, familyId: auth.familyId },
    });

    if (!existing) {
      throw notFound("Expense not found");
    }

    // Check authorization: editAny or editOwn
    const isOwnerOfExpense = existing.userId === auth.userId;
    if (isOwnerOfExpense) {
      if (!can(auth.role, "expense:editOwn") && !can(auth.role, "expense:editAny")) {
        throw httpError("You cannot edit this expense", 403);
      }
    } else {
      if (!can(auth.role, "expense:editAny")) {
        throw httpError("You cannot edit another member's expense", 403);
      }
    }

    if (data.input.amount <= 0) {
      throw new Error("Expense amount must be greater than 0");
    }

    const category = await prisma.category.findFirst({
      where: { id: data.input.categoryId, familyId: auth.familyId, archivedAt: null },
      select: { id: true },
    });
    if (!category) throw notFound("Category not found");
    const memberId = data.input.memberId ?? existing.memberId ?? auth.memberId;
    const member = await prisma.familyMember.findFirst({
      where: { id: memberId, familyId: auth.familyId },
      select: { id: true },
    });
    if (!member) throw notFound("Family member not found");

    await prisma.expense.update({
      where: { id: data.id },
      data: {
        amountPaise: toPaise(data.input.amount),
        categoryId: data.input.categoryId,
        memberId,
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
      throw notFound("Expense not found");
    }

    const isOwnerOfExpense = existing.userId === auth.userId;
    if (isOwnerOfExpense) {
      if (!can(auth.role, "expense:deleteOwn") && !can(auth.role, "expense:deleteAny")) {
        throw httpError("You cannot delete this expense", 403);
      }
    } else {
      if (!can(auth.role, "expense:deleteAny")) {
        throw httpError("You cannot delete another member's expense", 403);
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
