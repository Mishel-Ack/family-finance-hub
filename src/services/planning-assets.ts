import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { notFound } from "@/lib/http-error";
import { idSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

const nameSchema = z.string().trim().min(1).max(80);
const amountSchema = z.number().int().positive().max(10_000_000_000);
const createFundSchema = z.object({
  name: nameSchema,
  targetPaise: amountSchema,
  dueDate: z.string().date(),
  categoryId: idSchema.optional(),
});
const createGoalSchema = z.object({
  name: nameSchema,
  targetPaise: amountSchema,
  targetDate: z.string().date(),
});
const contributionSchema = z.object({ fundId: idSchema, amountPaise: amountSchema });

export const getPlanningAssetsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const [funds, goals] = await Promise.all([
      prisma.sinkingFund.findMany({
        where: { familyId: auth.familyId, archivedAt: null },
        include: {
          contributions: { where: { familyId: auth.familyId }, select: { amountPaise: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.goal.findMany({
        where: { familyId: auth.familyId, archivedAt: null },
        orderBy: { targetDate: "asc" },
      }),
    ]);
    const now = new Date();
    return {
      funds: funds.map((fund) => {
        const contributedPaise = fund.contributions.reduce(
          (sum, item) => sum + item.amountPaise,
          0,
        );
        const monthsLeft = Math.max(
          1,
          (fund.dueDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
            fund.dueDate.getUTCMonth() -
            now.getUTCMonth(),
        );
        return {
          id: fund.id,
          name: fund.name,
          targetPaise: fund.targetPaise,
          dueDate: fund.dueDate,
          contributedPaise,
          monthlySetAsidePaise: Math.ceil(
            Math.max(0, fund.targetPaise - contributedPaise) / monthsLeft,
          ),
          percent: Math.min(100, Math.round((contributedPaise / fund.targetPaise) * 100)),
        };
      }),
      goals: goals.map((goal) => {
        const monthsLeft = Math.max(
          1,
          (goal.targetDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
            goal.targetDate.getUTCMonth() -
            now.getUTCMonth(),
        );
        return {
          id: goal.id,
          name: goal.name,
          targetPaise: goal.targetPaise,
          targetDate: goal.targetDate,
          monthlyPlanPaise: Math.ceil(goal.targetPaise / monthsLeft),
        };
      }),
    };
  });

export const createSinkingFundFn = createServerFn({ method: "POST" })
  .validator(createFundSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("fund:manage");
    if (
      data.categoryId &&
      !(await prisma.category.findFirst({
        where: { id: data.categoryId, familyId: auth.familyId, archivedAt: null },
        select: { id: true },
      }))
    )
      throw notFound("Category not found");
    return prisma.sinkingFund.create({
      data: {
        name: data.name,
        targetPaise: data.targetPaise,
        ...(data.categoryId ? { categoryId: data.categoryId } : {}),
        dueDate: new Date(`${data.dueDate}T00:00:00.000Z`),
        familyId: auth.familyId,
        createdByMemberId: auth.memberId,
      },
    });
  });

export const createGoalFn = createServerFn({ method: "POST" })
  .validator(createGoalSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("fund:manage");
    return prisma.goal.create({
      data: {
        ...data,
        targetDate: new Date(`${data.targetDate}T00:00:00.000Z`),
        familyId: auth.familyId,
        createdByMemberId: auth.memberId,
      },
    });
  });

export const contributeToFundFn = createServerFn({ method: "POST" })
  .validator(contributionSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("fund:contribute");
    const fund = await prisma.sinkingFund.findFirst({
      where: { id: data.fundId, familyId: auth.familyId, archivedAt: null },
      select: { id: true },
    });
    if (!fund) throw notFound("Fund not found");
    return prisma.fundContribution.create({
      data: { ...data, familyId: auth.familyId, memberId: auth.memberId },
    });
  });

export function getPlanningAssets() {
  return getPlanningAssetsFn({ data: undefined });
}
export function createSinkingFund(input: z.infer<typeof createFundSchema>) {
  return createSinkingFundFn({ data: input });
}
export function createGoal(input: z.infer<typeof createGoalSchema>) {
  return createGoalFn({ data: input });
}
export function contributeToFund(input: z.infer<typeof contributionSchema>) {
  return contributeToFundFn({ data: input });
}

export async function getPlanningAssetsForCoach(familyId: string) {
  const [funds, goals] = await Promise.all([
    prisma.sinkingFund.findMany({
      where: { familyId, archivedAt: null },
      include: {
        contributions: { where: { familyId }, select: { amountPaise: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.goal.findMany({
      where: { familyId, archivedAt: null },
      orderBy: { targetDate: "asc" },
    }),
  ]);
  return { funds, goals };
}
