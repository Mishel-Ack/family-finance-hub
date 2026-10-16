import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthContext } from "@/lib/authz";

type ExpenseReader = Pick<PrismaClient, "expense"> | Pick<Prisma.TransactionClient, "expense">;
export type VisibleExpenseMode = "VISIBLE" | "SHARED" | "PRIVATE";

function expenseDateFilter(options: { from?: string | undefined; to?: string | undefined }) {
  const date: Prisma.DateTimeFilter = {};
  if (options.from) date.gte = new Date(`${options.from}T00:00:00.000Z`);
  if (options.to) date.lte = new Date(`${options.to}T23:59:59.999Z`);
  return date;
}

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
  const date = expenseDateFilter(options);
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

export async function searchVisibleExpenses(
  db: ExpenseReader,
  auth: AuthContext,
  term: string,
  limit = 8,
) {
  const search = term.trim().slice(0, 80);
  if (search.length < 2) return [];
  return db.expense.findMany({
    where: {
      AND: [
        listableWhere(auth),
        {
          OR: [
            { description: { contains: search, mode: "insensitive" } },
            { memberNameSnapshot: { contains: search, mode: "insensitive" } },
            { category: { is: { name: { contains: search, mode: "insensitive" } } } },
            { member: { is: { displayName: { contains: search, mode: "insensitive" } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      date: true,
      description: true,
      amountPaise: true,
      visibility: true,
      category: { select: { name: true } },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: Math.min(20, Math.max(1, limit)),
  });
}

export async function listSharedExpenses(
  db: ExpenseReader,
  familyId: string,
  options: { from?: string; to?: string; memberId?: string } = {},
) {
  const filters: Prisma.ExpenseWhereInput[] = [];
  if (options.from || options.to) {
    const date = expenseDateFilter(options);
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

export async function getSharedExpenseAmounts(
  db: ExpenseReader,
  familyId: string,
  from: Date,
  to: Date,
) {
  return db.expense.findMany({
    where: sharedWhere(familyId, { date: { gte: from, lt: to } }),
    select: { date: true, amountPaise: true },
  });
}

export async function sumSharedExpenseAmounts(
  db: ExpenseReader,
  familyId: string,
  from: Date,
  to: Date,
) {
  const result = await db.expense.aggregate({
    where: sharedWhere(familyId, { date: { gte: from, lt: to } }),
    _sum: { amountPaise: true },
  });
  return result._sum.amountPaise ?? 0;
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

export async function findExpenseByClientRequestId(
  db: ExpenseReader,
  familyId: string,
  userId: string,
  clientRequestId: string,
) {
  return db.expense.findUnique({
    where: {
      familyId_userId_clientRequestId: { familyId, userId, clientRequestId },
    },
    select: { id: true },
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
