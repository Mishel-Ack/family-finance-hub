import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { listSharedExpenses } from "@/lib/expense-queries";
import { prisma } from "@/lib/prisma";
import { notFound, httpError } from "@/lib/http-error";
import { recordActivity } from "@/lib/activity-queries";
import { Prisma } from "@prisma/client";
import { simulateScenario, type ScenarioChange } from "@/lib/ml/simulate";

export const scenarioChangeSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("REDUCE_CATEGORY"),
      categoryId: z.string().uuid(),
      percent: z.number().min(0).max(100),
      fromMonth: z.number().int().min(0).max(11).optional(),
    }),
    z.object({
      type: z.literal("RECURRING_EXPENSE"),
      categoryId: z.string().uuid(),
      amountPaise: z.number().int().positive().max(1_000_000_000),
      startMonth: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("ONE_OFF_EXPENSE"),
      categoryId: z.string().uuid(),
      amountPaise: z.number().int().positive().max(1_000_000_000),
      month: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("INCOME_CHANGE"),
      amountPaise: z.number().int().max(1_000_000_000).min(-1_000_000_000),
      fromMonth: z.number().int().min(0).max(11),
    }),
    z.object({
      type: z.literal("SAVINGS_TARGET"),
      amountPaise: z.number().int().positive().max(10_000_000_000),
    }),
  ])
  .array()
  .max(12);

const scenarioNameSchema = z.string().trim().min(1).max(80);
const scenarioIdSchema = z.string().uuid();

async function assertScenarioCategories(familyId: string, changes: ScenarioChange[]) {
  const categoryIds = [
    ...new Set(changes.flatMap((change) => ("categoryId" in change ? [change.categoryId] : []))),
  ];
  if (!categoryIds.length) return;
  const categories = await prisma.category.findMany({
    where: { familyId, id: { in: categoryIds }, archivedAt: null },
    select: { id: true },
  });
  if (categories.length !== categoryIds.length) throw notFound("Category not found");
}

function throwScenarioNameConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw httpError("A scenario with this name already exists", 409);
  }
  throw error;
}

export const listScenariosFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const scenarios = await prisma.scenario.findMany({
      where: { familyId: auth.familyId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: { id: true, name: true, definition: true, updatedAt: true },
    });
    return scenarios.map((scenario) => ({
      ...scenario,
      definition: scenarioChangeSchema.parse(scenario.definition),
    }));
  });

export const createScenarioFn = createServerFn({ method: "POST" })
  .validator(z.object({ name: scenarioNameSchema, changes: scenarioChangeSchema }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("scenario:manage");
    await assertScenarioCategories(auth.familyId, data.changes);
    try {
      return await prisma.$transaction(async (tx) => {
        const scenario = await tx.scenario.create({
          data: {
            familyId: auth.familyId,
            createdByMemberId: auth.memberId,
            nameSnapshot: auth.user.name.slice(0, 80),
            name: data.name,
            definition: data.changes,
          },
          select: { id: true, name: true, definition: true, updatedAt: true },
        });
        await recordActivity(tx, auth, {
          type: "SCENARIO_CREATED",
          entityType: "SCENARIO",
          entityId: scenario.id,
          summary: { name: scenario.name },
        });
        return { ...scenario, definition: scenarioChangeSchema.parse(scenario.definition) };
      });
    } catch (error) {
      throwScenarioNameConflict(error);
    }
  });

export const renameScenarioFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: scenarioIdSchema, name: scenarioNameSchema }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("scenario:manage");
    try {
      const updated = await prisma.scenario.updateMany({
        where: { id: data.id, familyId: auth.familyId },
        data: { name: data.name },
      });
      if (!updated.count) throw notFound("Scenario not found");
      return prisma.scenario
        .findFirstOrThrow({
          where: { id: data.id, familyId: auth.familyId },
          select: { id: true, name: true, definition: true, updatedAt: true },
        })
        .then((scenario) => ({
          ...scenario,
          definition: scenarioChangeSchema.parse(scenario.definition),
        }));
    } catch (error) {
      throwScenarioNameConflict(error);
    }
  });

export const deleteScenarioFn = createServerFn({ method: "POST" })
  .validator(scenarioIdSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("scenario:manage");
    await prisma.$transaction(async (tx) => {
      const scenario = await tx.scenario.findFirst({
        where: { id, familyId: auth.familyId },
        select: { id: true, name: true },
      });
      if (!scenario) throw notFound("Scenario not found");
      await recordActivity(tx, auth, {
        type: "SCENARIO_DELETED",
        entityType: "SCENARIO",
        entityId: scenario.id,
        summary: { name: scenario.name },
      });
      await tx.scenario.delete({ where: { id: scenario.id } });
    });
    return { success: true };
  });

export const runPlannerFn = createServerFn({ method: "POST" })
  .validator(scenarioChangeSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("planner:run");
    await assertScenarioCategories(auth.familyId, data);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
    const [expenses, income, budgets, categories] = await Promise.all([
      listSharedExpenses(prisma, auth.familyId, { from: start.toISOString().slice(0, 10) }),
      prisma.incomeProfile.findFirst({
        where: { familyId: auth.familyId },
        select: { monthlyIncomePaise: true },
      }),
      prisma.budget.findFirst({
        where: {
          familyId: auth.familyId,
          month: now.getUTCMonth() + 1,
          year: now.getUTCFullYear(),
        },
        select: { totalLimitPaise: true },
      }),
      prisma.category.findMany({
        where: { familyId: auth.familyId, archivedAt: null },
        select: { id: true },
      }),
    ]);
    const months = Array.from(
      { length: 6 },
      (_, offset) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1)),
    );
    const historyByCategory: Record<string, number[]> = Object.fromEntries(
      categories.map(({ id }) => [id, months.map(() => 0)]),
    );
    for (const expense of expenses) {
      const index = months.findIndex(
        (month) =>
          month.getUTCFullYear() === expense.date.getUTCFullYear() &&
          month.getUTCMonth() === expense.date.getUTCMonth(),
      );
      const categoryHistory = historyByCategory[expense.categoryId];
      if (index >= 0 && categoryHistory)
        categoryHistory[index] = (categoryHistory[index] ?? 0) + expense.amountPaise;
    }
    return simulateScenario({
      historyByCategory,
      changes: data,
      ...(income ? { monthlyIncomePaise: income.monthlyIncomePaise } : {}),
      ...(budgets ? { budgetByMonth: Array(12).fill(budgets.totalLimitPaise) as number[] } : {}),
      seed: now.getUTCFullYear() * 100 + now.getUTCMonth() + 1,
    });
  });

export function runPlanner(changes: ScenarioChange[]) {
  return runPlannerFn({ data: changes });
}

export function listScenarios() {
  return listScenariosFn({ data: undefined });
}

export function createScenario(input: { name: string; changes: ScenarioChange[] }) {
  return createScenarioFn({ data: input });
}

export function renameScenario(input: { id: string; name: string }) {
  return renameScenarioFn({ data: input });
}

export function deleteScenario(id: string) {
  return deleteScenarioFn({ data: id });
}
