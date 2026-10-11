import { createServerFn } from "@tanstack/react-start";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { httpError, notFound } from "@/lib/http-error";
import { idSchema } from "@/lib/validations";
import { listSharedExpenses } from "@/lib/expense-queries";
import { prisma } from "@/lib/prisma";
import { createInAppNotifications } from "@/lib/notifications";

const submitSchema = z.object({
  title: z.string().trim().min(2).max(120),
  amountPaise: z.number().int().positive().max(1_000_000_000),
  categoryId: idSchema,
  note: z.string().trim().max(500).default(""),
  neededBy: z.string().date().optional(),
});
const decisionSchema = z.object({
  id: idSchema,
  status: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z.string().trim().max(500).default(""),
});

export const listPurchaseRequestsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    return prisma.purchaseRequest.findMany({
      where: { familyId: auth.familyId },
      include: {
        requester: { select: { displayName: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  });

export const submitPurchaseRequestFn = createServerFn({ method: "POST" })
  .validator(submitSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("purchase:submit");
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, familyId: auth.familyId, archivedAt: null },
      select: { id: true },
    });
    if (!category) throw notFound("Category not found");
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [expenses, budget, categoryBudget] = await Promise.all([
      listSharedExpenses(prisma, auth.familyId, { from: monthStart.toISOString().slice(0, 10) }),
      prisma.budget.findFirst({
        where: {
          familyId: auth.familyId,
          month: now.getUTCMonth() + 1,
          year: now.getUTCFullYear(),
        },
        select: { totalLimitPaise: true },
      }),
      prisma.budgetCategory.findFirst({
        where: {
          budget: {
            familyId: auth.familyId,
            month: now.getUTCMonth() + 1,
            year: now.getUTCFullYear(),
          },
          categoryId: data.categoryId,
        },
        select: { limitAmountPaise: true },
      }),
    ]);
    const sharedSpend = expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
    const categorySpend = expenses
      .filter((expense) => expense.categoryId === data.categoryId)
      .reduce((sum, expense) => sum + expense.amountPaise, 0);
    const impactSnapshot: Prisma.InputJsonObject = {
      sharedMonthSpendPaise: sharedSpend,
      sharedCategorySpendPaise: categorySpend,
      totalBudgetRemainingPaise: (budget?.totalLimitPaise ?? 0) - sharedSpend,
      categoryBudgetRemainingPaise: (categoryBudget?.limitAmountPaise ?? 0) - categorySpend,
      requestAmountPaise: data.amountPaise,
      privateExpensesIncluded: false,
    };
    const request = await prisma.purchaseRequest.create({
      data: {
        ...data,
        neededBy: data.neededBy ? new Date(`${data.neededBy}T00:00:00.000Z`) : null,
        familyId: auth.familyId,
        requesterMemberId: auth.memberId,
        impactSnapshot,
      },
    });
    const recipients = await prisma.familyMember.findMany({
      where: {
        familyId: auth.familyId,
        role: { in: ["OWNER", "ADMIN"] },
        formerAt: null,
        userId: { not: null },
      },
      select: { userId: true },
    });
    await createInAppNotifications(prisma, {
      familyId: auth.familyId,
      userIds: recipients.flatMap((item) => (item.userId ? [item.userId] : [])),
      type: "PURCHASE_REQUEST",
      title: "Purchase request submitted",
      body: "A family member submitted a purchase request for review.",
      entityType: "PURCHASE_REQUEST",
      entityId: request.id,
      dedupeKey: `purchase-request:${request.id}:created`,
    });
    return request;
  });

export const decidePurchaseRequestFn = createServerFn({ method: "POST" })
  .validator(decisionSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("purchase:decide");
    const outcome = await prisma.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.findFirst({
        where: { id: data.id, familyId: auth.familyId },
        select: {
          id: true,
          requesterMemberId: true,
          status: true,
          title: true,
          requester: { select: { userId: true } },
        },
      });
      if (!request) throw notFound("Purchase request not found");
      if (request.status !== "PENDING")
        throw httpError("This request has already been decided", 409);
      if (request.requesterMemberId === auth.memberId) {
        const ownerCount = await tx.familyMember.count({
          where: { familyId: auth.familyId, role: "OWNER", formerAt: null },
        });
        if (!(auth.role === "OWNER" && ownerCount === 1))
          throw httpError("You cannot decide your own request", 403);
      }
      const changed = await tx.purchaseRequest.updateMany({
        where: { id: request.id, familyId: auth.familyId, status: "PENDING" },
        data: {
          status: data.status,
          decisionNote: data.decisionNote,
          decidedByMemberId: auth.memberId,
          decidedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw httpError("This request has already been decided", 409);
      return {
        updated: await tx.purchaseRequest.findFirst({
          where: { id: request.id, familyId: auth.familyId },
        }),
        requesterUserId: request.requester.userId,
        title: request.title,
      };
    });
    if (outcome.requesterUserId)
      await createInAppNotifications(prisma, {
        familyId: auth.familyId,
        userIds: [outcome.requesterUserId],
        type: "PURCHASE_DECISION",
        title: `Purchase request ${data.status.toLowerCase()}`,
        body: `Your purchase request “${outcome.title}” was ${data.status.toLowerCase()}.`,
        entityType: "PURCHASE_REQUEST",
        entityId: data.id,
        dedupeKey: `purchase-request:${data.id}:decision`,
      });
    return outcome.updated;
  });

export const cancelPurchaseRequestFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("purchase:cancelOwn");
    const existing = await prisma.purchaseRequest.findFirst({
      where: { id, familyId: auth.familyId },
      select: { id: true, requesterMemberId: true },
    });
    if (!existing || existing.requesterMemberId !== auth.memberId)
      throw notFound("Purchase request not found");
    const result = await prisma.purchaseRequest.updateMany({
      where: { id, familyId: auth.familyId, requesterMemberId: auth.memberId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (!result.count) throw httpError("This request is no longer pending", 409);
    return { success: true };
  });

export function listPurchaseRequests() {
  return listPurchaseRequestsFn({ data: undefined });
}
export function submitPurchaseRequest(input: z.input<typeof submitSchema>) {
  return submitPurchaseRequestFn({ data: input });
}
export function decidePurchaseRequest(input: z.input<typeof decisionSchema>) {
  return decidePurchaseRequestFn({ data: input });
}
export function cancelPurchaseRequest(id: string) {
  return cancelPurchaseRequestFn({ data: id });
}
