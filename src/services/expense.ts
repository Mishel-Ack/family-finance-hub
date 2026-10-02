import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, can } from "@/lib/authz";
import { fromPaise, toPaise } from "@/lib/money";
import type { Expense, ExpenseInput } from "@/types";
import { dateRangeSchema, expenseSchema, expenseUpdateSchema, idSchema } from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";
import { assertCategoryInFamily, assertMemberInFamily } from "@/lib/guards";
import { utcCalendarDate } from "@/lib/dates";
import { assertSameOrigin } from "@/lib/http-utils";

export const listExpensesFn = createServerFn({ method: "GET" })
  .validator(dateRangeSchema.optional())
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
    assertSameOrigin();
    const auth = await requireMember("expense:create");

    const amountPaise = toPaise(data.amount);

    let memberId: string | null = data.memberId ?? null;
    if (!memberId) memberId = auth.memberId;
    if (memberId !== auth.memberId && !can(auth.role, "expense:editAny")) {
      throw httpError("Only an ADMIN or OWNER can record an expense for another member", 403);
    }
    await Promise.all([
      assertCategoryInFamily(auth, data.categoryId),
      assertMemberInFamily(auth, memberId),
    ]);

    await prisma.expense.create({
      data: {
        familyId: auth.familyId,
        userId: auth.userId,
        memberId,
        categoryId: data.categoryId,
        amountPaise,
        date: utcCalendarDate(data.date),
        description: data.description ?? "",
      },
    });
  });

export const updateExpenseFn = createServerFn({ method: "POST" })
  .validator(expenseUpdateSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember();
    if (!can(auth.role, "expense:editAny") && !can(auth.role, "expense:editOwn")) {
      throw httpError("You cannot edit expenses", 403);
    }
    await assertCategoryInFamily(auth, data.input.categoryId);
    const memberId = data.input.memberId ?? auth.memberId;
    if (memberId !== auth.memberId && !can(auth.role, "expense:editAny")) {
      throw httpError("Only an ADMIN or OWNER can record an expense for another member", 403);
    }
    await assertMemberInFamily(auth, memberId);

    const result = await prisma.expense.updateMany({
      where: {
        id: data.id,
        familyId: auth.familyId,
        ...(!can(auth.role, "expense:editAny") ? { userId: auth.userId } : {}),
      },
      data: {
        amountPaise: toPaise(data.input.amount),
        categoryId: data.input.categoryId,
        memberId,
        date: utcCalendarDate(data.input.date),
        description: data.input.description ?? "",
      },
    });
    if (result.count === 0) throw notFound("Expense not found");
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember();
    if (!can(auth.role, "expense:deleteAny") && !can(auth.role, "expense:deleteOwn")) {
      throw httpError("You cannot delete expenses", 403);
    }

    const result = await prisma.expense.deleteMany({
      where: {
        id,
        familyId: auth.familyId,
        ...(!can(auth.role, "expense:deleteAny") ? { userId: auth.userId } : {}),
      },
    });
    if (result.count === 0) throw notFound("Expense not found");
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
