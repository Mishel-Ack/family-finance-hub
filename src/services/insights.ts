import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { requireMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/http-utils";
import { httpError, notFound } from "@/lib/http-error";
import { idSchema } from "@/lib/validations";
import { listSharedExpenses } from "@/lib/expense-queries";
import { detectAnomalies } from "@/lib/ml/anomaly";
import { forecastMonth, type ForecastMonth } from "@/lib/ml/forecast";
import { detectRecurring } from "@/lib/ml/recurring";
import { financialHealthScore } from "@/lib/ml/health";

interface InsightDraft {
  type:
    | "MID_MONTH_OVERSPEND"
    | "CATEGORY_ANOMALY"
    | "DUPLICATE_CHARGE"
    | "RECURRING_BILL"
    | "PRICE_INCREASE"
    | "FORECAST"
    | "FINANCIAL_HEALTH";
  key: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  payload: Prisma.InputJsonObject;
}

function kolkataCalendar(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function monthsBack(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export async function recomputeInsights(familyId: string) {
  const now = new Date();
  const current = kolkataCalendar(now);
  const currentMonthStart = new Date(Date.UTC(current.year, current.month - 1, 1));
  const fromDate = new Date(Date.UTC(current.year, current.month - 1 - 11, 1));
  const [expenses, categories, budgets, income] = await Promise.all([
    listSharedExpenses(prisma, familyId, { from: fromDate.toISOString().slice(0, 10) }),
    prisma.category.findMany({
      where: { familyId, archivedAt: null },
      select: { id: true, name: true },
    }),
    prisma.budget.findMany({
      where: { familyId, year: { gte: current.year - 1, lte: current.year } },
    }),
    prisma.incomeProfile.findFirst({ where: { familyId }, select: { monthlyIncomePaise: true } }),
  ]);
  const budget =
    budgets.find((item) => item.month === current.month && item.year === current.year) ?? null;
  const monthlyTotals = new Map<string, Record<string, number>>();
  const monthlyCumulative = new Map<string, Record<string, number[]>>();
  const currentSpend: Record<string, number> = {};
  for (const expense of expenses) {
    const key = monthKey(expense.date.getUTCFullYear(), expense.date.getUTCMonth() + 1);
    const totals = monthlyTotals.get(key) ?? {};
    totals[expense.categoryId] = (totals[expense.categoryId] ?? 0) + expense.amountPaise;
    monthlyTotals.set(key, totals);
    if (key === monthKey(current.year, current.month)) {
      currentSpend[expense.categoryId] =
        (currentSpend[expense.categoryId] ?? 0) + expense.amountPaise;
    }
    const cumulative = monthlyCumulative.get(key) ?? {};
    const daily = cumulative[expense.categoryId] ?? Array.from({ length: 31 }, () => 0);
    const day = expense.date.getUTCDate();
    for (let index = day - 1; index < daily.length; index++)
      daily[index] = (daily[index] ?? 0) + expense.amountPaise;
    cumulative[expense.categoryId] = daily;
    monthlyCumulative.set(key, cumulative);
  }

  const history: ForecastMonth[] = Array.from({ length: 6 }, (_, offset) =>
    monthsBack(current.year, current.month, 6 - offset),
  ).map(({ year, month }) => {
    const key = monthKey(year, month);
    return {
      month: key,
      categories: monthlyTotals.get(key) ?? {},
      cumulativeByDay: monthlyCumulative.get(key) ?? {},
    };
  });
  const forecast = forecastMonth({
    history,
    currentSpentByCategory: currentSpend,
    dayOfMonth: current.day,
    daysInMonth: new Date(Date.UTC(current.year, current.month, 0)).getUTCDate(),
    seed: Number(`${current.year}${String(current.month).padStart(2, "0")}`),
  });
  const categoryTotals = Object.fromEntries(
    categories.map((category) => [
      category.id,
      history.map((month) => month.categories[category.id] ?? 0),
    ]),
  );
  const anomalies = detectAnomalies({
    expenses: expenses.map((expense) => ({
      id: expense.id,
      categoryId: expense.categoryId,
      merchant: expense.description || expense.category?.name || "Expense",
      amountPaise: expense.amountPaise,
      date: expense.date.toISOString().slice(0, 10),
    })),
    monthlyCategoryTotals: categoryTotals,
  });
  const recurring = detectRecurring({
    expenses: expenses.map((expense) => ({
      merchant: expense.description || expense.category?.name || "Expense",
      date: expense.date.toISOString().slice(0, 10),
      amountPaise: expense.amountPaise,
    })),
    now,
  });
  const totalCurrentSpend = Object.values(currentSpend).reduce((sum, amount) => sum + amount, 0);
  const budgetedHistory = history.flatMap((month) => {
    const [yearText, monthText] = month.month.split("-");
    const historicalBudget = budgets.find(
      (item) => item.year === Number(yearText) && item.month === Number(monthText),
    );
    return historicalBudget
      ? [
          {
            spendPaise: Object.values(month.categories).reduce((sum, amount) => sum + amount, 0),
            budgetPaise: historicalBudget.totalLimitPaise,
          },
        ]
      : [];
  });
  const health = financialHealthScore({
    monthlySpendPaise: [
      ...budgetedHistory.map((month) => month.spendPaise),
      ...(budget ? [totalCurrentSpend] : []),
    ],
    monthlyBudgetPaise: [
      ...budgetedHistory.map((month) => month.budgetPaise),
      ...(budget ? [budget.totalLimitPaise] : []),
    ],
    ...(income ? { monthlyIncomePaise: income.monthlyIncomePaise } : {}),
  });

  const drafts: InsightDraft[] = [];
  if (budget && totalCurrentSpend >= budget.totalLimitPaise * 0.8 && current.day <= 20) {
    drafts.push({
      type: "MID_MONTH_OVERSPEND",
      key: `${current.year}-${current.month}`,
      severity: totalCurrentSpend >= budget.totalLimitPaise ? "HIGH" : "MEDIUM",
      payload: {
        spentPaise: totalCurrentSpend,
        budgetPaise: budget.totalLimitPaise,
        reason:
          "Shared spending has used at least 80% of this month's budget before the month is over.",
      },
    });
  }
  if (budget && forecast.total.rangePaise.p90 > budget.totalLimitPaise) {
    drafts.push({
      type: "FORECAST",
      key: `${current.year}-${current.month}`,
      severity: forecast.total.pointPaise > budget.totalLimitPaise ? "HIGH" : "MEDIUM",
      payload: {
        projectedPaise: forecast.total.pointPaise,
        upperRangePaise: forecast.total.rangePaise.p90,
        budgetPaise: budget.totalLimitPaise,
        dataSufficiency: forecast.dataSufficiency,
        reason: forecast.total.reason,
      },
    });
  }
  for (const flag of anomalies) {
    if (flag.kind === "DUPLICATE") {
      drafts.push({
        type: "DUPLICATE_CHARGE",
        key: flag.key,
        severity: flag.severity,
        payload: { reason: flag.reason, expenseId: flag.expenseId ?? null },
      });
    } else {
      drafts.push({
        type: "CATEGORY_ANOMALY",
        key: flag.key,
        severity: flag.severity,
        payload: {
          categoryId: flag.categoryId ?? null,
          expenseId: flag.expenseId ?? null,
          reason: flag.reason,
          kind: flag.kind,
        },
      });
    }
  }
  for (const pattern of recurring) {
    const dueDate = new Date(`${pattern.nextExpectedDate}T00:00:00.000Z`);
    const daysUntil =
      Math.floor((dueDate.getTime() - currentMonthStart.getTime()) / 86400000) - (current.day - 1);
    if (pattern.priceChanged) {
      drafts.push({
        type: "PRICE_INCREASE",
        key: pattern.merchant,
        severity: "MEDIUM",
        payload: {
          merchant: pattern.merchant,
          typicalAmountPaise: pattern.typicalAmountPaise,
          reason: `The latest recurring amount from ${pattern.merchant} changed from its previous typical amount.`,
        },
      });
    }
    if (daysUntil >= 0 && daysUntil <= 3) {
      drafts.push({
        type: "RECURRING_BILL",
        key: pattern.merchant,
        severity: "LOW",
        payload: {
          merchant: pattern.merchant,
          expectedDate: pattern.nextExpectedDate,
          amountPaise: pattern.typicalAmountPaise,
          reason: pattern.reason,
        },
      });
    }
  }
  if (health.score !== null) {
    drafts.push({
      type: "FINANCIAL_HEALTH",
      key: `${current.year}-${current.month}`,
      severity: health.score < 40 ? "HIGH" : health.score < 65 ? "MEDIUM" : "LOW",
      payload: { score: health.score, confidence: health.confidence, reason: health.reason },
    });
  }

  for (const draft of drafts) {
    const existing = await prisma.insight.findFirst({
      where: { familyId, type: draft.type, key: draft.key },
      select: { id: true, payload: true, dismissedAt: true },
    });
    const changed = existing ? stableJson(existing.payload) !== stableJson(draft.payload) : false;
    await prisma.insight.upsert({
      where: { familyId_type_key: { familyId, type: draft.type, key: draft.key } },
      create: {
        familyId,
        type: draft.type,
        key: draft.key,
        payload: draft.payload,
        severity: draft.severity,
        computedAt: now,
      },
      update: {
        payload: draft.payload,
        severity: draft.severity,
        computedAt: now,
        ...(changed ? { dismissedAt: null, dismissedByUserId: null } : {}),
      },
    });
  }
  const existingRows = await prisma.insight.findMany({
    where: { familyId },
    select: { id: true, type: true, key: true },
  });
  const active = new Set(drafts.map((draft) => `${draft.type}:${draft.key}`));
  const staleIds = existingRows
    .filter((row) => !active.has(`${row.type}:${row.key}`))
    .map((row) => row.id);
  if (staleIds.length)
    await prisma.insight.deleteMany({ where: { familyId, id: { in: staleIds } } });
  return { familyId, count: drafts.length };
}

const dismissSchema = idSchema;
const feedbackSchema = z.object({
  insightId: idSchema,
  verdict: z.enum(["USEFUL", "NOT_USEFUL", "DISMISS"]),
});
const incomeSchema = z.number().int().positive().max(1_000_000_000).nullable();

export const getIncomeProfileFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const profile = await prisma.incomeProfile.findFirst({
      where: { familyId: auth.familyId },
      select: { monthlyIncomePaise: true, updatedAt: true },
    });
    return profile;
  });

export const listInsightsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    return prisma.insight.findMany({
      where: { familyId: auth.familyId, dismissedAt: null },
      orderBy: [{ severity: "desc" }, { computedAt: "desc" }],
      select: { id: true, type: true, payload: true, severity: true, computedAt: true },
    });
  });

export const dismissInsightFn = createServerFn({ method: "POST" })
  .validator(dismissSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("insight:feedback");
    const found = await prisma.insight.findFirst({
      where: { id, familyId: auth.familyId },
      select: { id: true },
    });
    if (!found) throw notFound("Insight not found");
    await prisma.insight.updateMany({
      where: { id, familyId: auth.familyId },
      data: { dismissedAt: new Date(), dismissedByUserId: auth.userId },
    });
    return { success: true };
  });

export const giveInsightFeedbackFn = createServerFn({ method: "POST" })
  .validator(feedbackSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("insight:feedback");
    const found = await prisma.insight.findFirst({
      where: { id: data.insightId, familyId: auth.familyId },
      select: { id: true },
    });
    if (!found) throw notFound("Insight not found");
    await prisma.insightFeedback.upsert({
      where: { insightId_userId: { insightId: found.id, userId: auth.userId } },
      create: { insightId: found.id, userId: auth.userId, verdict: data.verdict },
      update: { verdict: data.verdict },
    });
    if (data.verdict === "DISMISS") {
      await prisma.insight.updateMany({
        where: { id: found.id, familyId: auth.familyId },
        data: { dismissedAt: new Date(), dismissedByUserId: auth.userId },
      });
    }
    return { success: true };
  });

export const setIncomeProfileFn = createServerFn({ method: "POST" })
  .validator(incomeSchema)
  .handler(async ({ data: monthlyIncomePaise }) => {
    assertSameOrigin();
    const auth = await requireMember("insight:setIncome");
    if (monthlyIncomePaise === null) {
      await prisma.incomeProfile.deleteMany({ where: { familyId: auth.familyId } });
    } else {
      await prisma.incomeProfile.upsert({
        where: { familyId: auth.familyId },
        create: { familyId: auth.familyId, monthlyIncomePaise },
        update: { monthlyIncomePaise },
      });
    }
    queueInsightRecompute(auth.familyId);
    return { success: true };
  });

const recomputeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function queueInsightRecompute(familyId: string) {
  const prior = recomputeTimers.get(familyId);
  if (prior) clearTimeout(prior);
  const timer = setTimeout(() => {
    recomputeTimers.delete(familyId);
    void recomputeInsights(familyId).catch(() => undefined);
  }, 2000);
  timer.unref?.();
  recomputeTimers.set(familyId, timer);
}

export async function recomputeAllInsights() {
  const families = await prisma.family.findMany({ select: { id: true } });
  const results = [];
  for (const family of families) results.push(await recomputeInsights(family.id));
  return results;
}

export function listInsights() {
  return listInsightsFn({ data: undefined });
}

export function getIncomeProfile() {
  return getIncomeProfileFn({ data: undefined });
}

export function dismissInsight(id: string) {
  return dismissInsightFn({ data: id });
}

export function giveInsightFeedback(
  insightId: string,
  verdict: z.infer<typeof feedbackSchema>["verdict"],
) {
  return giveInsightFeedbackFn({ data: { insightId, verdict } });
}

export function setIncomeProfile(amountPaise: number | null) {
  return setIncomeProfileFn({ data: amountPaise });
}
