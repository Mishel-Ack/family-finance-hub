import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { listSharedExpenses, listVisibleExpenses } from "@/lib/expense-queries";
import { expensesToCsv } from "@/lib/csv-export";
import { consumeRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-queries";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

export const exportExpensesFn = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        includePrivate: z.boolean(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      })
      .refine((input) => !input.from || !input.to || input.from <= input.to, {
        message: "The start date must be on or before the end date.",
      }),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("readAll");
    await consumeRateLimit(`expense-export:${auth.familyId}:${auth.userId}`, 5, 15 * 60 * 1000);
    const range = {
      ...(data.from ? { from: data.from } : {}),
      ...(data.to ? { to: data.to } : {}),
    };
    const expenses = data.includePrivate
      ? await listVisibleExpenses(prisma, auth, range)
      : await listSharedExpenses(prisma, auth.familyId, range);
    await prisma.$transaction((tx) =>
      recordActivity(tx, auth, {
        type: "EXPORT_PERFORMED",
        entityType: "FAMILY",
        entityId: auth.familyId,
        summary: { from: data.from ?? null, to: data.to ?? null },
      }),
    );
    return {
      csv: expensesToCsv(
        expenses.map((expense) => ({
          date: expense.date.toISOString().slice(0, 10),
          description: expense.description,
          category_name: expense.category.name,
          member_name_snapshot: expense.memberNameSnapshot,
          member_id: expense.memberId,
          family_member:
            expense.member?.displayName ||
            (expense.memberNameSnapshot ? `Former member (${expense.memberNameSnapshot})` : ""),
          amount_paise: expense.amountPaise,
          visibility: expense.visibility,
        })),
        data.includePrivate,
      ),
    };
  });

export function exportExpenses(
  includePrivate: boolean,
  range: { from?: string; to?: string } = {},
) {
  return exportExpensesFn({ data: { includePrivate, ...range } });
}
