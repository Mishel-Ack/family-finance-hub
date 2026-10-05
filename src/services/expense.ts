import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/prisma";
import { requireMember, can, assertCan, type AuthContext } from "@/lib/authz";
import type { Prisma } from "@prisma/client";
import { fromPaise, toPaise } from "@/lib/money";
import type { Expense, ExpenseInput } from "@/types";
import {
  expenseListQuerySchema,
  expenseSchema,
  expenseUpdateSchema,
  idSchema,
} from "@/lib/validations";
import { httpError, notFound } from "@/lib/http-error";
import { assertCategoryInFamily, assertMemberInFamily } from "@/lib/guards";
import { utcCalendarDate } from "@/lib/dates";
import { assertSameOrigin } from "@/lib/http-utils";
import {
  findListableExpense,
  findSharedExpenseWithSplits,
  listVisibleExpenses,
  listableWhere,
} from "@/lib/expense-queries";
import { recordActivity, redactExpenseActivity } from "@/lib/activity-queries";
import { computeEqualSplit, computeExactSplit, computePercentSplit } from "@/lib/splits";
import type { z } from "zod";
import type { splitInputSchema } from "@/lib/validations";

type SplitInput = z.infer<typeof splitInputSchema>;

async function serializableExpense<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "P2034" ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("Could not complete the expense transaction");
}

function weightedExactSplit(
  amountPaise: number,
  prior: { memberId: string; sharePaise: number }[],
) {
  const total = prior.reduce((sum, item) => sum + item.sharePaise, 0);
  const rows = prior.map(({ memberId, sharePaise }) => {
    const numerator = amountPaise * sharePaise;
    return { memberId, sharePaise: Math.floor(numerator / total), remainder: numerator % total };
  });
  let remaining = amountPaise - rows.reduce((sum, item) => sum + item.sharePaise, 0);
  for (const row of [...rows].sort(
    (a, b) =>
      b.remainder - a.remainder || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
  )) {
    if (remaining <= 0) break;
    row.sharePaise++;
    remaining--;
  }
  if (rows.some((row) => row.sharePaise < 1))
    throw httpError("Each participant must receive at least 1 paise", 400);
  return rows.map(({ memberId, sharePaise }) => ({ memberId, sharePaise }));
}

async function resolveSplit(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  input: SplitInput,
  amountPaise: number,
) {
  const shares =
    input.mode === "EQUAL"
      ? computeEqualSplit(amountPaise, input.memberIds)
      : input.mode === "EXACT"
        ? computeExactSplit(amountPaise, input.participants)
        : computePercentSplit(amountPaise, input.participants);
  const ids = shares.map((share) => share.memberId);
  const currentMembers = await tx.familyMember.findMany({
    where: { familyId: auth.familyId, formerAt: null, id: { in: ids } },
    select: { id: true },
  });
  if (currentMembers.length !== ids.length)
    throw notFound("One or more split participants are not current family members");
  return shares.map((share) => ({
    ...share,
    mode: input.mode,
    basisPoints:
      input.mode === "PERCENT"
        ? input.participants.find((participant) => participant.memberId === share.memberId)!
            .basisPoints
        : null,
  }));
}

async function replaceExpenseSplit(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  expense: { id: string; amountPaise: number; userId: string },
  amountPaise: number,
  input: SplitInput | null | undefined,
  oldSplits: {
    memberId: string;
    sharePaise: number;
    mode: "EQUAL" | "EXACT" | "PERCENT";
    basisPoints: number | null;
  }[],
) {
  if (input) {
    if (expense.userId === auth.userId) assertCan(auth.role, "split:create");
    else assertCan(auth.role, "split:manageAny");
  }
  if (input === null) {
    if (oldSplits.length) {
      await recordActivity(tx, auth, {
        type: "SPLIT_REMOVED",
        entityType: "SPLIT",
        entityId: expense.id,
        summary: { amountPaise: expense.amountPaise },
      });
    }
    await tx.expenseSplit.deleteMany({ where: { expenseId: expense.id } });
    return;
  }
  let newRows = input ? await resolveSplit(tx, auth, input, amountPaise) : undefined;
  if (!input && oldSplits.length && amountPaise !== expense.amountPaise) {
    const mode = oldSplits[0]!.mode;
    if (mode === "EQUAL")
      newRows = computeEqualSplit(
        amountPaise,
        oldSplits.map((row) => row.memberId),
      ).map((row) => ({ ...row, mode, basisPoints: null }));
    else if (mode === "PERCENT" && oldSplits.every((row) => row.basisPoints !== null)) {
      newRows = computePercentSplit(
        amountPaise,
        oldSplits.map((row) => ({ memberId: row.memberId, basisPoints: row.basisPoints! })),
      ).map((row) => ({
        ...row,
        mode,
        basisPoints: oldSplits.find((old) => old.memberId === row.memberId)!.basisPoints,
      }));
    } else {
      newRows = weightedExactSplit(amountPaise, oldSplits).map((row) => ({
        ...row,
        mode: "EXACT" as const,
        basisPoints: null,
      }));
    }
    const active = await tx.familyMember.findMany({
      where: {
        familyId: auth.familyId,
        formerAt: null,
        id: { in: newRows.map((row) => row.memberId) },
      },
      select: { id: true },
    });
    if (active.length !== newRows.length)
      throw notFound("A split participant is no longer a current family member");
  }
  if (newRows) {
    await tx.expenseSplit.deleteMany({ where: { expenseId: expense.id } });
    await tx.expenseSplit.createMany({
      data: newRows.map((row) => ({ expenseId: expense.id, ...row })),
    });
    await recordActivity(tx, auth, {
      type: "SPLIT_CREATED",
      entityType: "SPLIT",
      entityId: expense.id,
      summary: { amountPaise, participantCount: newRows.length, mode: newRows[0]!.mode },
    });
  }
}

export const listExpensesFn = createServerFn({ method: "GET" })
  .validator(expenseListQuerySchema.optional())
  .handler(async ({ data }) => {
    const auth = await requireMember("readAll");

    const items = await listVisibleExpenses(prisma, auth, {
      ...(data?.from ? { from: data.from } : {}),
      ...(data?.to ? { to: data.to } : {}),
      ...(data?.visibility ? { mode: data.visibility } : {}),
    });

    return items.map(
      (e) =>
        ({
          id: e.id,
          family_id: e.familyId,
          user_id: e.userId,
          member_id: e.memberId,
          member_id_snapshot: e.memberIdSnapshot,
          member_name_snapshot: e.memberNameSnapshot,
          amount_paise: e.amountPaise,
          amount: fromPaise(e.amountPaise),
          category_id: e.categoryId,
          category_name: e.category?.name ?? "General",
          category_color: e.category?.color ?? "#6b7280",
          category_icon: e.category?.icon ?? "Tag",
          category: e.category?.name ?? "General",
          date: e.date.toISOString().slice(0, 10),
          description: e.description,
          family_member:
            (e.member?.formerAt
              ? `Former member (${e.memberNameSnapshot ?? e.member.displayName})`
              : e.member?.displayName) ??
            (e.memberNameSnapshot ? `Former member (${e.memberNameSnapshot})` : ""),
          created_at: e.createdAt.toISOString(),
          visibility: e.visibility,
          splits: e.splits.map((split) => ({
            member_id: split.memberId,
            member_name: split.member.formerAt
              ? `Former member (${split.member.displayName})`
              : split.member.displayName,
            share_paise: split.sharePaise,
            mode: split.mode,
            basis_points: split.basisPoints,
          })),
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
    if (data.visibility === "PRIVATE" && memberId !== auth.memberId) {
      throw httpError("Private expenses must belong to your own member profile", 400);
    }
    if (memberId !== auth.memberId && !can(auth.role, "expense:editAny")) {
      throw httpError("Only an ADMIN or OWNER can record an expense for another member", 403);
    }
    await Promise.all([
      assertCategoryInFamily(auth, data.categoryId),
      assertMemberInFamily(auth, memberId),
    ]);

    await serializableExpense(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: data.categoryId, familyId: auth.familyId },
        select: { name: true },
      });
      if (!category) throw notFound("Category not found");
      const expense = await tx.expense.create({
        data: {
          familyId: auth.familyId,
          userId: auth.userId,
          memberId,
          categoryId: data.categoryId,
          amountPaise,
          date: utcCalendarDate(data.date),
          description: data.description ?? "",
          visibility: data.visibility,
        },
      });
      if (expense.visibility === "SHARED") {
        await recordActivity(tx, auth, {
          type: "EXPENSE_CREATED",
          entityType: "EXPENSE",
          entityId: expense.id,
          summary: {
            amountPaise: expense.amountPaise,
            categoryName: category.name.slice(0, 80),
            description: expense.description.slice(0, 80),
          },
        });
        if (data.split) await replaceExpenseSplit(tx, auth, expense, amountPaise, data.split, []);
      } else if (data.split) {
        throw httpError("Private expenses cannot have splits", 400);
      }
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
    const current = await findListableExpense(prisma, auth, data.id);
    if (!current) throw notFound("Expense not found");
    const changesVisibility = current.visibility !== data.input.visibility;
    if (changesVisibility && current.userId !== auth.userId) {
      throw httpError("Only the creator can change expense visibility", 403);
    }
    if (data.input.visibility === "PRIVATE" && memberId !== auth.memberId) {
      throw httpError("Private expenses must belong to your own member profile", 400);
    }
    if (memberId !== auth.memberId && !can(auth.role, "expense:editAny")) {
      throw httpError("Only an ADMIN or OWNER can record an expense for another member", 403);
    }
    await assertMemberInFamily(auth, memberId);

    await serializableExpense(async (tx) => {
      const currentWithSplits =
        current.visibility === "SHARED"
          ? await findSharedExpenseWithSplits(tx, auth.familyId, data.id)
          : null;
      const oldSplits = currentWithSplits?.splits ?? [];
      if (
        current.visibility === "SHARED" &&
        data.input.visibility === "PRIVATE" &&
        oldSplits.length
      ) {
        throw httpError("Remove the split first", 400);
      }
      const result = await tx.expense.updateMany({
        where: {
          AND: [
            listableWhere(auth),
            {
              id: data.id,
              familyId: auth.familyId,
              visibility: current.visibility,
              ...(changesVisibility ? { userId: auth.userId } : {}),
              ...(!can(auth.role, "expense:editAny") ? { userId: auth.userId } : {}),
            },
          ],
        },
        data: {
          amountPaise: toPaise(data.input.amount),
          categoryId: data.input.categoryId,
          memberId,
          date: utcCalendarDate(data.input.date),
          description: data.input.description ?? "",
          visibility: data.input.visibility,
        },
      });
      if (result.count === 0) throw notFound("Expense not found");
      if (data.input.visibility === "SHARED" && (oldSplits.length > 0 || data.input.split)) {
        await replaceExpenseSplit(
          tx,
          auth,
          { id: data.id, amountPaise: current.amountPaise, userId: current.userId },
          toPaise(data.input.amount),
          data.input.split,
          oldSplits,
        );
      } else if (data.input.visibility === "PRIVATE" && data.input.split) {
        throw httpError("Private expenses cannot have splits", 400);
      }
      const updated = await findListableExpense(tx, auth, data.id);
      if (!updated) throw notFound("Expense not found");
      if (current.visibility === "SHARED" && data.input.visibility === "PRIVATE") {
        await redactExpenseActivity(tx, auth.familyId, data.id);
      } else if (data.input.visibility === "SHARED") {
        await recordActivity(tx, auth, {
          type: current.visibility === "PRIVATE" ? "EXPENSE_CREATED" : "EXPENSE_UPDATED",
          entityType: "EXPENSE",
          entityId: data.id,
          summary: {
            amountPaise: updated.amountPaise,
            categoryName: updated.category.name.slice(0, 80),
            description: updated.description.slice(0, 80),
          },
        });
      }
    });
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember();
    if (!can(auth.role, "expense:deleteAny") && !can(auth.role, "expense:deleteOwn")) {
      throw httpError("You cannot delete expenses", 403);
    }

    await prisma.$transaction(async (tx) => {
      const expense = await findListableExpense(tx, auth, id);
      if (!expense) throw notFound("Expense not found");
      const result = await tx.expense.deleteMany({
        where: {
          AND: [
            listableWhere(auth),
            {
              id,
              familyId: auth.familyId,
              visibility: expense.visibility,
              ...(!can(auth.role, "expense:deleteAny") ? { userId: auth.userId } : {}),
            },
          ],
        },
      });
      if (result.count === 0) throw notFound("Expense not found");
      if (expense.visibility === "SHARED") {
        await recordActivity(tx, auth, {
          type: "EXPENSE_DELETED",
          entityType: "EXPENSE",
          entityId: id,
          summary: {
            amountPaise: expense.amountPaise,
            categoryName: expense.category.name.slice(0, 80),
            description: expense.description.slice(0, 80),
          },
        });
      } else {
        await redactExpenseActivity(tx, auth.familyId, id);
      }
    });
  });

// Client helper wrappers
export function listExpenses(
  from?: string,
  to?: string,
  visibility: "VISIBLE" | "SHARED" | "PRIVATE" = "VISIBLE",
) {
  return listExpensesFn({ data: { from, to, visibility } });
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
