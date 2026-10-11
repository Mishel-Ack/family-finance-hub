import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { loadEnv } from "vite";
import { recordActivity } from "../src/lib/activity-queries.ts";
import { computeEqualSplit } from "../src/lib/splits.ts";
import { toPaise } from "../src/lib/money.ts";
import type { AuthContext } from "../src/lib/authz.ts";

const prisma = new PrismaClient();
const DEMO_FAMILY = "Sharma Family";
export const DEMO_FAMILY_ID = stableId("family");
export const LARGE_SEED_OUTLIER_INDEXES = [45, 137, 251, 348] as const;
export const DEMO_PASSWORD = "FamilyBudgetDemo2026!";
export const DEMO_INVITE_TOKEN = "familybudget-demo-invite-token-2026";

const fileEnv = loadEnv("development", process.cwd(), "");
for (const name of ["DATABASE_URL", "NODE_ENV", "ALLOW_DEMO_SEED"] as const) {
  if (process.env[name] === undefined && fileEnv[name] !== undefined) {
    process.env[name] = fileEnv[name];
  }
}
export async function disconnectDemoSeed() {
  await prisma.$disconnect();
}

export function stableId(key: string): string {
  const hex = createHash("sha256").update(`familybudget-demo:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function ensureSafeTarget(args: string[]) {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Demo seeding is disabled in production.");
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("Set DATABASE_URL before running the demo seed.");
  const host = new URL(databaseUrl).hostname.toLowerCase();
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (
    !localHost &&
    !(args.includes("--force-remote") && process.env["ALLOW_DEMO_SEED"] === "true")
  ) {
    throw new Error("Remote demo seeding requires --force-remote and ALLOW_DEMO_SEED=true.");
  }
}

const members = [
  { key: "owner", name: "Aarav Sharma", role: "OWNER" as const },
  { key: "admin", name: "Priya Sharma", role: "ADMIN" as const },
  { key: "member", name: "Kabir Sharma", role: "MEMBER" as const },
  { key: "viewer", name: "Anaya Sharma", role: "VIEWER" as const },
];
const categories = [
  { key: "rent", name: "Rent", color: "#7c3aed" },
  { key: "groceries", name: "Groceries", color: "#16a34a" },
  { key: "food", name: "Dining & delivery", color: "#f97316" },
  { key: "utilities", name: "Utilities", color: "#0284c7" },
  { key: "school", name: "Education", color: "#db2777" },
  { key: "transport", name: "Transport", color: "#ca8a04" },
  { key: "health", name: "Health", color: "#dc2626" },
  { key: "subscriptions", name: "Subscriptions", color: "#4f46e5" },
  { key: "shopping", name: "Shopping", color: "#0891b2" },
];

const expenseTemplates = [
  ["rent", "Monthly apartment rent", 28000, 0, false],
  ["groceries", "BigBasket monthly groceries", 3849.5, 1, false],
  ["food", "Swiggy dinner", 849.5, 2, false],
  ["utilities", "Electricity bill", 2380, 0, false],
  ["utilities", "Jio Fiber and mobile", 1299, 1, false],
  ["school", "School fees", 12500, 0, false],
  ["transport", "Petrol", 2650, 2, false],
  ["health", "Pharmacy and check-up", 1760, 1, true],
  ["subscriptions", "Netflix and Hotstar", 798, 0, false],
  ["shopping", "Festival shopping", 18750, 1, false],
  ["food", "Zomato weekend lunch", 1149, 3, false],
  ["groceries", "BigBasket monthly groceries", 4218.75, 2, false],
  ["transport", "Petrol", 2890, 0, false],
  ["shopping", "Washing machine repair", 9250, 1, false],
  ["health", "Dental visit", 2300, 3, false],
  ["food", "Swiggy dinner", 1325, 2, false],
  ["groceries", "BigBasket monthly groceries", 3999, 0, false],
  ["utilities", "Electricity bill", 2540, 1, false],
  ["transport", "Petrol", 2749.5, 2, false],
  ["subscriptions", "Netflix and Hotstar", 798, 0, true],
  ["school", "School fees", 12500, 0, false],
  ["shopping", "Diwali electronics and gifts", 76499, 1, false],
  ["food", "Zomato weekend lunch", 999, 3, false],
  ["health", "Medical supplies", 1480, 2, true],
] as const;

export async function seedDemo(args = process.argv.slice(2)) {
  ensureSafeTarget(args);
  if (args.includes("--reset")) {
    await prisma.expenseSplit.deleteMany({ where: { expense: { familyId: DEMO_FAMILY_ID } } });
    await prisma.settlement.deleteMany({ where: { familyId: DEMO_FAMILY_ID } });
    await prisma.family.deleteMany({ where: { id: DEMO_FAMILY_ID } });
  }

  const passwordHash = await hash(DEMO_PASSWORD, 12);
  const users = await Promise.all(
    members.map((member) =>
      prisma.user.upsert({
        where: { email: `demo-${member.key}@example.com` },
        create: {
          id: stableId(`user:${member.key}`),
          name: member.name,
          email: `demo-${member.key}@example.com`,
          passwordHash,
        },
        update: { name: member.name, passwordHash },
      }),
    ),
  );
  const family = await prisma.family.upsert({
    where: { id: DEMO_FAMILY_ID },
    create: { id: DEMO_FAMILY_ID, name: DEMO_FAMILY, ownerId: users[0]!.id },
    update: { name: DEMO_FAMILY, ownerId: users[0]!.id },
  });
  const familyMembers = await Promise.all(
    members.map((member, index) =>
      prisma.familyMember.upsert({
        where: { userId: users[index]!.id },
        create: {
          id: stableId(`member:${member.key}`),
          familyId: family.id,
          userId: users[index]!.id,
          displayName: member.name,
          role: member.role,
        },
        update: {
          familyId: family.id,
          displayName: member.name,
          role: member.role,
          formerAt: null,
        },
      }),
    ),
  );
  const categoryRows = await Promise.all(
    categories.map((category) =>
      prisma.category.upsert({
        where: { familyId_name: { familyId: family.id, name: category.name } },
        create: {
          id: stableId(`category:${category.key}`),
          familyId: family.id,
          name: category.name,
          color: category.color,
          icon: "Tag",
        },
        update: { color: category.color, archivedAt: null },
      }),
    ),
  );
  const categoryByKey = new Map(
    categories.map((category, index) => [category.key, categoryRows[index]!]),
  );
  const now = new Date();
  const auth: AuthContext = {
    userId: users[0]!.id,
    familyId: family.id,
    memberId: familyMembers[0]!.id,
    role: "OWNER",
    user: { id: users[0]!.id, name: users[0]!.name, email: users[0]!.email },
  };

  const expenseIds: string[] = [];
  for (let index = 0; index < expenseTemplates.length; index++) {
    const [categoryKey, description, rupees, memberIndex, privateExpense] =
      expenseTemplates[index]!;
    const monthOffset = Math.floor(index / 9);
    const firstDay = monthOffset === 2 ? 1 : 3;
    const dayRange = monthOffset === 2 ? now.getUTCDate() : 25;
    const day = firstDay + ((index * 3) % dayRange);
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (2 - monthOffset), day, 12),
    );
    const id = stableId(`expense:${index}`);
    const category = categoryByKey.get(categoryKey)!;
    const member = familyMembers[memberIndex]!;
    const expense = await prisma.expense.upsert({
      where: { id },
      create: {
        id,
        familyId: family.id,
        userId: users[memberIndex]!.id,
        memberId: member.id,
        categoryId: category.id,
        amountPaise: toPaise(rupees),
        description,
        date,
        visibility: privateExpense ? "PRIVATE" : "SHARED",
      },
      update: {
        familyId: family.id,
        userId: users[memberIndex]!.id,
        memberId: member.id,
        categoryId: category.id,
        amountPaise: toPaise(rupees),
        description,
        date,
        visibility: privateExpense ? "PRIVATE" : "SHARED",
      },
    });
    expenseIds.push(expense.id);
  }

  if (args.includes("--large")) {
    const largeCategories = [
      "groceries",
      "food",
      "transport",
      "utilities",
      "school",
      "health",
      "subscriptions",
      "shopping",
    ] as const;
    const generatedCount = 376;
    const generatedExpenses: Prisma.ExpenseCreateManyInput[] = [];
    for (let index = 0; index < generatedCount; index++) {
      const monthOffset = 5 - Math.floor(index / 63);
      const day =
        1 + ((index * 7 + Math.floor(index / 11)) % (monthOffset === 0 ? now.getUTCDate() : 27));
      const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, day, 12),
      );
      const categoryKey =
        largeCategories[(index * 13 + Math.floor(index / 7)) % largeCategories.length]!;
      const memberIndex = (index * 5 + Math.floor(index / 3)) % members.length;
      const ordinaryAmounts: Record<(typeof largeCategories)[number], number> = {
        groceries: 600 + ((index * 173) % 3400),
        food: 250 + ((index * 127) % 1800),
        transport: 300 + ((index * 151) % 2400),
        utilities: index % 6 === 0 ? 1200 + ((index * 37) % 1800) : 180 + ((index * 41) % 650),
        school: index % 8 === 0 ? 6500 + ((index * 71) % 5000) : 150 + ((index * 43) % 950),
        health: 200 + ((index * 89) % 2300),
        subscriptions: index % 5 === 0 ? 799 : 99 + ((index * 17) % 500),
        shopping: 300 + ((index * 211) % 5000),
      };
      const isOutlier = LARGE_SEED_OUTLIER_INDEXES.some((outlierIndex) => outlierIndex === index);
      const amount = isOutlier
        ? 42000 +
          LARGE_SEED_OUTLIER_INDEXES.indexOf(index as (typeof LARGE_SEED_OUTLIER_INDEXES)[number]) *
            7500
        : ordinaryAmounts[categoryKey];
      const descriptions: Record<(typeof largeCategories)[number], string> = {
        groceries: [
          "BigBasket groceries",
          "Blinkit household groceries",
          "DMart monthly provisions",
        ][index % 3]!,
        food: ["Swiggy dinner", "Zomato family lunch", "Dominos takeaway"][index % 3]!,
        transport: ["Ola ride", "Indian Oil petrol", "Metro travel recharge"][index % 3]!,
        utilities: ["Jio bill", "Electricity board bill", "Indane gas cylinder"][index % 3]!,
        school: ["School fees", "Tuition classes", "School supplies"][index % 3]!,
        health: ["Apollo Pharmacy medicine", "PharmEasy order", "Clinic visit"][index % 3]!,
        subscriptions: ["Netflix subscription", "Spotify subscription", "Hotstar subscription"][
          index % 3
        ]!,
        shopping: ["Amazon household purchase", "Flipkart order", "Myntra clothing"][index % 3]!,
      };
      const key = `expense:large:${index}`;
      const id = stableId(key);
      const expenseCategory = categoryByKey.get(categoryKey)!;
      const member = familyMembers[memberIndex]!;
      const description = isOutlier
        ? `${descriptions[categoryKey]} · seeded outlier`
        : descriptions[categoryKey];
      generatedExpenses.push({
        id,
        familyId: family.id,
        userId: users[memberIndex]!.id,
        memberId: member.id,
        categoryId: expenseCategory.id,
        amountPaise: toPaise(amount),
        description,
        date,
        visibility: "SHARED",
        familyId: family.id,
        userId: users[memberIndex]!.id,
        memberId: member.id,
        categoryId: expenseCategory.id,
        amountPaise: toPaise(amount),
        description,
        date,
        visibility: "SHARED" as const,
      });
    }
    await prisma.expense.createMany({ data: generatedExpenses, skipDuplicates: true });
  }

  const splitIndexes = [2, 10, 14, 18, 22];
  for (const index of splitIndexes) {
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseIds[index]! } });
    const participantIds = familyMembers.slice(0, 3).map((member) => member.id);
    const shares = computeEqualSplit(expense.amountPaise, participantIds);
    await prisma.expenseSplit.deleteMany({ where: { expenseId: expense.id } });
    await prisma.expenseSplit.createMany({
      data: shares.map((share) => ({ expenseId: expense.id, ...share, mode: "EQUAL" as const })),
    });
  }

  const monthKeys: { month: number; year: number; id: string }[] = [];
  for (let offset = 2; offset >= 0; offset--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const budget = await prisma.budget.upsert({
      where: {
        familyId_month_year: {
          familyId: family.id,
          month: date.getUTCMonth() + 1,
          year: date.getUTCFullYear(),
        },
      },
      create: {
        id: stableId(`budget:${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`),
        familyId: family.id,
        month: date.getUTCMonth() + 1,
        year: date.getUTCFullYear(),
        totalLimitPaise: toPaise(95000),
      },
      update: { totalLimitPaise: toPaise(95000) },
    });
    monthKeys.push({ month: budget.month, year: budget.year, id: budget.id });
    for (let index = 0; index < categories.length; index++) {
      const category = categoryRows[index]!;
      const limit = index === 8 ? 5000 : index === 0 ? 30000 : 15000;
      await prisma.budgetCategory.upsert({
        where: { budgetId_categoryId: { budgetId: budget.id, categoryId: category.id } },
        create: {
          id: stableId(`budget-category:${budget.id}:${category.id}`),
          budgetId: budget.id,
          categoryId: category.id,
          limitAmountPaise: toPaise(limit),
        },
        update: { limitAmountPaise: toPaise(limit) },
      });
    }
  }

  const splitExpense = await prisma.expense.findUniqueOrThrow({ where: { id: expenseIds[2]! } });
  const splitMembers = familyMembers.slice(0, 3);
  const settlement = {
    id: stableId("settlement:partial"),
    familyId: family.id,
    fromMemberId: splitMembers[1]!.id,
    toMemberId: splitMembers[2]!.id,
    fromNameSnapshot: splitMembers[1]!.displayName,
    toNameSnapshot: splitMembers[2]!.displayName,
    amountPaise: Math.max(1, Math.floor(splitExpense.amountPaise / 12)),
    note: "Part payment for shared dinner",
    createdByMemberId: familyMembers[0]!.id,
  };
  await prisma.settlement.upsert({
    where: { id: settlement.id },
    create: settlement,
    update: settlement,
  });
  const secondSettlement = {
    ...settlement,
    id: stableId("settlement:second"),
    fromMemberId: splitMembers[2]!.id,
    toMemberId: splitMembers[0]!.id,
    fromNameSnapshot: splitMembers[2]!.displayName,
    toNameSnapshot: splitMembers[0]!.displayName,
    amountPaise: toPaise(250),
    note: "Monthly settle-up",
  };
  await prisma.settlement.upsert({
    where: { id: secondSettlement.id },
    create: secondSettlement,
    update: secondSettlement,
  });
  const thirdSettlement = {
    ...settlement,
    id: stableId("settlement:third"),
    fromMemberId: splitMembers[1]!.id,
    toMemberId: splitMembers[0]!.id,
    fromNameSnapshot: splitMembers[1]!.displayName,
    toNameSnapshot: splitMembers[0]!.displayName,
    amountPaise: toPaise(575),
    note: "Shared utilities contribution",
  };
  await prisma.settlement.upsert({
    where: { id: thirdSettlement.id },
    create: thirdSettlement,
    update: thirdSettlement,
  });

  const inviteId = stableId("invite:pending");
  const invite = await prisma.invite.upsert({
    where: { id: inviteId },
    create: {
      id: inviteId,
      familyId: family.id,
      createdByMemberId: familyMembers[0]!.id,
      createdByDisplayNameSnapshot: familyMembers[0]!.displayName,
      role: "MEMBER",
      tokenHash: createHash("sha256").update(DEMO_INVITE_TOKEN).digest("hex"),
      email: "future-member@example.com",
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    },
    update: {
      familyId: family.id,
      tokenHash: createHash("sha256").update(DEMO_INVITE_TOKEN).digest("hex"),
      revokedAt: null,
      usedAt: null,
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    },
  });

  await prisma.$transaction(async (tx) => {
    const activities = [
      ...expenseIds.flatMap((expenseId, index) => {
        const [categoryKey, description, rupees, , isPrivate] = expenseTemplates[index]!;
        if (isPrivate) return [];
        return [
          {
            type: "EXPENSE_CREATED" as const,
            entityType: "EXPENSE" as const,
            entityId: expenseId,
            summary: {
              amountPaise: toPaise(rupees),
              categoryName: categoryByKey.get(categoryKey)!.name,
              description,
            },
          },
        ];
      }),
      ...monthKeys.map((month) => ({
        type: "BUDGET_UPSERTED" as const,
        entityType: "BUDGET" as const,
        entityId: month.id,
        summary: {
          operation: "TOTAL_LIMIT_SET" as const,
          month: month.month,
          year: month.year,
          totalLimitPaise: toPaise(95000),
        },
      })),
      ...splitIndexes.map((index) => ({
        type: "SPLIT_CREATED" as const,
        entityType: "SPLIT" as const,
        entityId: expenseIds[index]!,
        summary: {
          amountPaise: toPaise(expenseTemplates[index]![2]),
          participantCount: 3,
          mode: "EQUAL" as const,
        },
      })),
      ...[settlement, secondSettlement, thirdSettlement].map((item) => ({
        type: "SETTLEMENT_RECORDED" as const,
        entityType: "SETTLEMENT" as const,
        entityId: item.id,
        summary: { amountPaise: item.amountPaise },
      })),
      {
        type: "INVITE_CREATED" as const,
        entityType: "INVITE" as const,
        entityId: invite.id,
        summary: { role: "MEMBER" as const },
      },
    ];
    for (const activity of activities) {
      const existing = await tx.activityLog.findFirst({
        where: { familyId: family.id, type: activity.type, entityId: activity.entityId },
      });
      if (!existing) await recordActivity(tx, auth, activity);
    }
  });

  const counts = {
    users: users.length,
    members: await prisma.familyMember.count({ where: { familyId: family.id, formerAt: null } }),
    expenses: await prisma.expense.count({ where: { familyId: family.id } }),
    categories: await prisma.category.count({ where: { familyId: family.id } }),
    budgets: await prisma.budget.count({ where: { familyId: family.id } }),
    splits: await prisma.expenseSplit.count({ where: { expense: { familyId: family.id } } }),
    settlements: await prisma.settlement.count({ where: { familyId: family.id } }),
    activities: await prisma.activityLog.count({ where: { familyId: family.id } }),
  };
  if (process.env["NODE_ENV"] !== "production") {
    console.info(`Demo accounts use password: ${DEMO_PASSWORD}`);
  }
  console.info(`Seeded ${DEMO_FAMILY}: ${JSON.stringify(counts)}`);
  return { familyId: family.id, counts };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  seedDemo()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Demo seed failed.");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
