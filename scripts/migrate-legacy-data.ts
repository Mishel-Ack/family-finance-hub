import { PrismaClient, type Prisma } from "@prisma/client";

type LegacyBudget = {
  id: string;
  familyId: string;
  month: number;
  year: number;
  totalLimit: number;
};
type LegacyBudgetCategory = { id: string; budgetId: string; category: string; limitAmount: number };
type LegacyExpense = {
  id: string;
  familyId: string;
  userId: string;
  category: string;
  familyMember: string | null;
  amount: number;
  date: Date;
  description: string | null;
};

const legacyUrl = process.env["DATABASE_URL_LEGACY"];
const targetUrl = process.env["DATABASE_URL"];
if (!legacyUrl || !targetUrl) {
  throw new Error(
    "Set DATABASE_URL_LEGACY to the legacy PostgreSQL database and DATABASE_URL to the migrated target.",
  );
}
const dbIdentity = (value: string) => {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}:${url.port}${url.pathname}?schema=${url.searchParams.get("schema") ?? "public"}`;
};
if (dbIdentity(legacyUrl) === dbIdentity(targetUrl)) {
  throw new Error("DATABASE_URL_LEGACY and DATABASE_URL must identify separate databases.");
}

const dryRun = process.argv.includes("--dry-run");
const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
const counts = { migrated: 0, skipped: 0, unmatchedMembers: 0 };

function paise(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}

async function run() {
  const budgets = await legacy.$queryRawUnsafe<LegacyBudget[]>(
    'SELECT "id", "familyId", "month", "year", "totalLimit" FROM "Budget"',
  );
  const budgetCategories = await legacy.$queryRawUnsafe<LegacyBudgetCategory[]>(
    'SELECT "id", "budgetId", "category", "limitAmount" FROM "BudgetCategory"',
  );
  const expenses = await legacy.$queryRawUnsafe<LegacyExpense[]>(
    'SELECT "id", "familyId", "userId", "category", "familyMember", "amount", "date", "description" FROM "Expense"',
  );

  const write = async (tx: Prisma.TransactionClient) => {
    const ensureCategory = async (familyId: string, name: string) => {
      const existing = await tx.category.findUnique({
        where: { familyId_name: { familyId, name } },
      });
      if (existing || dryRun) return existing;
      return tx.category.create({ data: { familyId, name } });
    };
    for (const budget of budgets) {
      const amount = paise(budget.totalLimit);
      if (
        amount === null ||
        !(await tx.family.findUnique({ where: { id: budget.familyId }, select: { id: true } }))
      ) {
        counts.skipped += 1;
        continue;
      }
      if (!dryRun)
        await tx.budget.upsert({
          where: { id: budget.id },
          create: {
            id: budget.id,
            familyId: budget.familyId,
            month: budget.month,
            year: budget.year,
            totalLimitPaise: amount,
          },
          update: { totalLimitPaise: amount },
        });
      counts.migrated += 1;
    }

    for (const item of budgetCategories) {
      const budget = budgets.find(({ id }) => id === item.budgetId);
      const amount = paise(item.limitAmount);
      const familyExists = budget
        ? await tx.family.findUnique({ where: { id: budget.familyId }, select: { id: true } })
        : null;
      const targetBudgetExists = dryRun
        ? Boolean(familyExists)
        : await tx.budget.findUnique({ where: { id: item.budgetId } });
      if (!budget || amount === null || !targetBudgetExists) {
        counts.skipped += 1;
        continue;
      }
      if (!dryRun) {
        const category = await ensureCategory(budget.familyId, item.category.trim());
        if (!category) {
          counts.skipped += 1;
          continue;
        }
        await tx.budgetCategory.upsert({
          where: { budgetId_categoryId: { budgetId: item.budgetId, categoryId: category.id } },
          create: {
            id: item.id,
            budgetId: item.budgetId,
            categoryId: category.id,
            limitAmountPaise: amount,
          },
          update: { limitAmountPaise: amount },
        });
      }
      counts.migrated += 1;
    }

    for (const expense of expenses) {
      const amount = paise(expense.amount);
      const family = await tx.family.findUnique({
        where: { id: expense.familyId },
        select: { id: true },
      });
      const user = await tx.user.findUnique({
        where: { id: expense.userId },
        select: { id: true },
      });
      if (!family || !user || amount === null) {
        counts.skipped += 1;
        continue;
      }
      const categoryName = expense.category.trim() || "Uncategorized";
      const category = dryRun ? null : await ensureCategory(expense.familyId, categoryName);
      if (!dryRun && !category) {
        counts.skipped += 1;
        continue;
      }
      const member = expense.familyMember?.trim()
        ? await tx.familyMember.findFirst({
            where: {
              familyId: expense.familyId,
              displayName: { equals: expense.familyMember.trim(), mode: "insensitive" },
            },
            select: { id: true },
          })
        : null;
      if (expense.familyMember?.trim() && !member) counts.unmatchedMembers += 1;
      if (!dryRun && category)
        await tx.expense.upsert({
          where: { id: expense.id },
          create: {
            id: expense.id,
            familyId: expense.familyId,
            userId: expense.userId,
            memberId: member?.id ?? null,
            categoryId: category.id,
            amountPaise: amount,
            date: new Date(
              Date.UTC(
                expense.date.getUTCFullYear(),
                expense.date.getUTCMonth(),
                expense.date.getUTCDate(),
              ),
            ),
            description: expense.description ?? "",
          },
          update: {
            memberId: member?.id ?? null,
            categoryId: category.id,
            amountPaise: amount,
            date: new Date(
              Date.UTC(
                expense.date.getUTCFullYear(),
                expense.date.getUTCMonth(),
                expense.date.getUTCDate(),
              ),
            ),
            description: expense.description ?? "",
          },
        });
      counts.migrated += 1;
    }
  };

  if (dryRun) {
    await target
      .$transaction(async (tx) => {
        await write(tx);
        throw new Error("DRY_RUN_ROLLBACK");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "DRY_RUN_ROLLBACK") throw error;
      });
  } else await target.$transaction(async (tx) => write(tx));
  console.log(
    `${dryRun ? "Dry run" : "Migration"} counts: migrated=${counts.migrated}, skipped=${counts.skipped}, unmatchedMembers=${counts.unmatchedMembers}`,
  );
}

try {
  await run();
} finally {
  await Promise.all([legacy.$disconnect(), target.$disconnect()]);
}
