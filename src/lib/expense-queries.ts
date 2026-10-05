import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthContext } from "@/lib/authz";

type ExpenseReader = Pick<PrismaClient, "expense"> | Pick<Prisma.TransactionClient, "expense">;
export type VisibleExpenseMode = "VISIBLE" | "SHARED" | "PRIVATE";

export function sharedWhere(
  familyId: string,
  additional: Prisma.ExpenseWhereInput = {},
): Prisma.ExpenseWhereInput {
  return { AND: [{ familyId, visibility: "SHARED" }, additional] };
}

export function ownPrivateWhere(
  auth: Pick<AuthContext, "familyId" | "userId">,
  additional: Prisma.ExpenseWhereInput = {},
): Prisma.ExpenseWhereInput {
  return {
    AND: [{ familyId: auth.familyId, visibility: "PRIVATE", userId: auth.userId }, additional],
  };
}

export function listableWhere(
  auth: Pick<AuthContext, "familyId" | "userId">,
  mode: VisibleExpenseMode = "VISIBLE",
): Prisma.ExpenseWhereInput {
  if (mode === "SHARED") return sharedWhere(auth.familyId);
  if (mode === "PRIVATE") return ownPrivateWhere(auth);
  return {
    familyId: auth.familyId,
    OR: [{ visibility: "SHARED" }, { visibility: "PRIVATE", userId: auth.userId }],
  };
}

export function allFamilyExpensesWhere(familyId: string): Prisma.ExpenseWhereInput {
  return { familyId };
}

export function sharedExpensesWhere(
  familyId: string,
  additional: Prisma.ExpenseWhereInput = {},
): Prisma.ExpenseWhereInput {
  return sharedWhere(familyId, additional);
}

export function privateExpensesForMemberWhere(
  familyId: string,
  memberId: string,
): Prisma.ExpenseWhereInput {
  return { familyId, memberId, visibility: "PRIVATE" };
}

export async function listVisibleExpenses(
  db: ExpenseReader,
  auth: AuthContext,
  options: { mode?: VisibleExpenseMode; from?: string; to?: string } = {},
) {
  const date: Prisma.DateTimeFilter = {};
  if (options.from) date.gte = new Date(options.from);
  if (options.to) date.lte = new Date(options.to);
  const where = listableWhere(auth, options.mode);
  return db.expense.findMany({
    where: options.from || options.to ? { AND: [where, { date }] } : where,
    include: {
      category: true,
      member: true,
      splits: { include: { member: true }, orderBy: { memberId: "asc" } },
    },
    orderBy: { date: "desc" },
  });
}

export async function listSharedExpenses(
  db: ExpenseReader,
  familyId: string,
  options: { from?: string; to?: string; memberId?: string } = {},
) {
  const filters: Prisma.ExpenseWhereInput[] = [];
  if (options.from || options.to) {
    const date: Prisma.DateTimeFilter = {};
    if (options.from) date.gte = new Date(options.from);
    if (options.to) date.lte = new Date(options.to);
    filters.push({ date });
  }
  if (options.memberId) {
    filters.push({
      OR: [{ memberId: options.memberId }, { memberIdSnapshot: options.memberId }],
    });
  }
  return db.expense.findMany({
    where: sharedWhere(familyId, filters.length ? { AND: filters } : {}),
    include: { category: true, member: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function findListableExpense(db: ExpenseReader, auth: AuthContext, id: string) {
  return db.expense.findFirst({
    where: { AND: [listableWhere(auth), { id, familyId: auth.familyId }] },
    select: {
      id: true,
      userId: true,
      visibility: true,
      amountPaise: true,
      description: true,
      category: { select: { name: true } },
    },
  });
}

export async function findSharedExpenseWithSplits(db: ExpenseReader, familyId: string, id: string) {
  return db.expense.findFirst({
    where: sharedWhere(familyId, { id }),
    include: { splits: { orderBy: { memberId: "asc" } } },
  });
}

export async function listSharedExpensesWithSplits(db: ExpenseReader, familyId: string) {
  return db.expense.findMany({
    where: sharedWhere(familyId, { splits: { some: {} } }),
    include: { splits: { orderBy: { memberId: "asc" } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

export async function groupSharedActivityByMember(db: ExpenseReader, familyId: string) {
  return db.expense.groupBy({
    by: ["memberId"],
    where: sharedExpensesWhere(familyId, { memberId: { not: null } }),
    _max: { updatedAt: true },
  });
}

export async function countAllFamilyExpenses(db: ExpenseReader, familyId: string) {
  return db.expense.count({ where: allFamilyExpensesWhere(familyId) });
}

export async function countAllCategoryExpenses(
  db: ExpenseReader,
  familyId: string,
  categoryId: string,
) {
  return db.expense.count({ where: { familyId, categoryId } });
}
