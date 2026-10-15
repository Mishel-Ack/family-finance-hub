import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { listSharedExpenses, listVisibleExpenses } from "@/lib/expense-queries";
import { expensesToCsv } from "@/lib/csv-export";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const exportExpensesFn = createServerFn({ method: "POST" })
  .validator(z.object({ includePrivate: z.boolean() }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("readAll");
    enforceRateLimit(`expense-export:${auth.familyId}:${auth.userId}`, 5, 15 * 60 * 1000);
    const expenses = data.includePrivate
      ? await listVisibleExpenses(prisma, auth)
      : await listSharedExpenses(prisma, auth.familyId);
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

export function exportExpenses(includePrivate: boolean) {
  return exportExpensesFn({ data: { includePrivate } });
}
