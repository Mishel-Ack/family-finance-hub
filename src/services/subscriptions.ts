import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { listSharedExpenses } from "@/lib/expense-queries";
import { normalizeMerchant } from "@/lib/ml/categorizer";
import { detectRecurring } from "@/lib/ml/recurring";
import { prisma } from "@/lib/prisma";
import { httpError, notFound } from "@/lib/http-error";

const merchantSchema = z.string().trim().min(1).max(120);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

const updateStatusSchema = z.discriminatedUnion("status", [
  z.object({
    merchant: merchantSchema,
    status: z.literal("CONFIRMED"),
    intervalDays: z.number().int().min(1).max(365),
    nextExpectedDate: dateSchema,
    typicalAmountPaise: z.number().int().positive().max(1_000_000_000).optional(),
  }),
  z.object({ merchant: merchantSchema, status: z.literal("DISMISSED") }),
]);

const manualSubscriptionSchema = z.object({
  merchant: merchantSchema,
  intervalDays: z.number().int().min(1).max(365),
  nextExpectedDate: dateSchema,
  typicalAmountPaise: z.number().int().positive().max(1_000_000_000).optional(),
});

function merchantKey(value: string) {
  const key = normalizeMerchant(value);
  if (!key)
    throw httpError("Enter a recurring payment name with at least one letter or number.", 400);
  return key;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getConfirmedRecurringSchedules(familyId: string) {
  return prisma.recurringPatternRecord.findMany({
    where: { familyId, status: "CONFIRMED", nextExpectedAt: { not: null } },
    select: {
      merchantKey: true,
      nextExpectedAt: true,
      typicalAmountPaise: true,
    },
  });
}

export const listRecurringSubscriptionsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const expenses = await listSharedExpenses(prisma, auth.familyId, { from });
    const patterns = detectRecurring({
      expenses: expenses.map((expense) => ({
        merchant: expense.description || expense.category.name,
        date: expense.date.toISOString().slice(0, 10),
        amountPaise: expense.amountPaise,
      })),
      now,
    });
    const records = await prisma.recurringPatternRecord.findMany({
      where: { familyId: auth.familyId },
      select: {
        merchantKey: true,
        status: true,
        intervalDays: true,
        nextExpectedAt: true,
        typicalAmountPaise: true,
      },
    });
    const known = new Map(records.map((record) => [record.merchantKey, record]));
    const seen = new Set<string>();
    const detected = patterns.map((pattern) => {
      const key = merchantKey(pattern.merchant);
      seen.add(key);
      const record = known.get(key);
      return {
        ...pattern,
        status: record?.status ?? "DETECTED",
        intervalDays: record?.intervalDays ?? pattern.intervalDays,
        nextExpectedDate: record?.nextExpectedAt
          ? dateOnly(record.nextExpectedAt)
          : pattern.nextExpectedDate,
        typicalAmountPaise: record?.typicalAmountPaise ?? pattern.typicalAmountPaise,
      };
    });
    const manual = records.flatMap((record) => {
      if (seen.has(record.merchantKey) || record.intervalDays === null || !record.nextExpectedAt) {
        return [];
      }
      return [
        {
          merchant: record.merchantKey,
          intervalDays: record.intervalDays,
          nextExpectedDate: dateOnly(record.nextExpectedAt),
          typicalAmountPaise: record.typicalAmountPaise ?? 0,
          confidence: 1,
          priceChanged: false,
          possibleForgotten: false,
          reason: "Added and managed manually by your family.",
          status: record.status,
        },
      ];
    });
    return [...detected, ...manual].sort((left, right) =>
      left.merchant.localeCompare(right.merchant),
    );
  });

export const updateRecurringSubscriptionStatusFn = createServerFn({ method: "POST" })
  .validator(updateStatusSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("expense:create");
    const key = merchantKey(data.merchant);
    const schedule =
      data.status === "CONFIRMED"
        ? {
            intervalDays: data.intervalDays,
            nextExpectedAt: new Date(`${data.nextExpectedDate}T00:00:00.000Z`),
            typicalAmountPaise: data.typicalAmountPaise ?? null,
          }
        : {};
    return prisma.recurringPatternRecord.upsert({
      where: { familyId_merchantKey: { familyId: auth.familyId, merchantKey: key } },
      create: {
        familyId: auth.familyId,
        merchantKey: key,
        status: data.status,
        ...schedule,
      },
      update: { status: data.status, ...schedule },
      select: { merchantKey: true, status: true },
    });
  });

export const createManualRecurringSubscriptionFn = createServerFn({ method: "POST" })
  .validator(manualSubscriptionSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("expense:create");
    const key = merchantKey(data.merchant);
    return prisma.recurringPatternRecord.upsert({
      where: { familyId_merchantKey: { familyId: auth.familyId, merchantKey: key } },
      create: {
        familyId: auth.familyId,
        merchantKey: key,
        status: "CONFIRMED",
        intervalDays: data.intervalDays,
        nextExpectedAt: new Date(`${data.nextExpectedDate}T00:00:00.000Z`),
        typicalAmountPaise: data.typicalAmountPaise ?? null,
      },
      update: {
        status: "CONFIRMED",
        intervalDays: data.intervalDays,
        nextExpectedAt: new Date(`${data.nextExpectedDate}T00:00:00.000Z`),
        typicalAmountPaise: data.typicalAmountPaise ?? null,
      },
      select: { merchantKey: true, status: true },
    });
  });

export const advanceRecurringSubscriptionFn = createServerFn({ method: "POST" })
  .validator(merchantSchema)
  .handler(async ({ data: merchant }) => {
    assertSameOrigin();
    const auth = await requireMember("expense:create");
    const key = merchantKey(merchant);
    const record = await prisma.recurringPatternRecord.findUnique({
      where: { familyId_merchantKey: { familyId: auth.familyId, merchantKey: key } },
      select: { intervalDays: true, nextExpectedAt: true, status: true },
    });
    if (
      !record ||
      record.status !== "CONFIRMED" ||
      record.intervalDays === null ||
      !record.nextExpectedAt
    ) {
      throw notFound("Confirmed recurring payment not found");
    }
    const today = new Date();
    const scheduled = record.nextExpectedAt;
    const baseline =
      scheduled.getTime() >
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
        ? scheduled
        : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const nextExpectedAt = new Date(baseline.getTime() + record.intervalDays * 86400000);
    await prisma.recurringPatternRecord.update({
      where: { familyId_merchantKey: { familyId: auth.familyId, merchantKey: key } },
      data: { nextExpectedAt },
    });
    return { merchantKey: key, nextExpectedDate: dateOnly(nextExpectedAt) };
  });

export function listRecurringSubscriptions() {
  return listRecurringSubscriptionsFn({ data: undefined });
}

export function updateRecurringSubscriptionStatus(input: z.infer<typeof updateStatusSchema>) {
  return updateRecurringSubscriptionStatusFn({ data: input });
}

export function createManualRecurringSubscription(input: z.infer<typeof manualSubscriptionSchema>) {
  return createManualRecurringSubscriptionFn({ data: input });
}

export function advanceRecurringSubscription(merchant: string) {
  return advanceRecurringSubscriptionFn({ data: merchant });
}
