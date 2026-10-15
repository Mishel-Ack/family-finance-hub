import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { listSharedExpenses } from "@/lib/expense-queries";
import { detectRecurring } from "@/lib/ml/recurring";
import { prisma } from "@/lib/prisma";

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
    const known = await prisma.recurringPatternRecord.findMany({
      where: {
        familyId: auth.familyId,
        merchantKey: { in: patterns.map((item) => item.merchant) },
      },
      select: { merchantKey: true, status: true },
    });
    const statusByMerchant = new Map(known.map(({ merchantKey, status }) => [merchantKey, status]));
    return patterns.map((pattern) => ({
      ...pattern,
      status: statusByMerchant.get(pattern.merchant) ?? "DETECTED",
    }));
  });

export function listRecurringSubscriptions() {
  return listRecurringSubscriptionsFn({ data: undefined });
}
