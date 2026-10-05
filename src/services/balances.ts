import { createServerFn } from "@tanstack/react-start";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember, can, assertCan } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { httpError, notFound } from "@/lib/http-error";
import { amountSchema, idSchema } from "@/lib/validations";
import { toPaise, fromPaise } from "@/lib/money";
import { listSharedExpensesWithSplits } from "@/lib/expense-queries";
import { computeBalances, simplifyDebts } from "@/lib/splits";
import { recordActivity } from "@/lib/activity-queries";

const settlementInputSchema = z.object({
  fromMemberId: idSchema,
  toMemberId: idSchema,
  amount: amountSchema.refine((amount) => amount <= 10_000_000, "Amount cannot exceed ₹1 crore"),
  note: z.string().trim().max(200).default(""),
});
const settlementIdSchema = idSchema;
const balanceQuerySchema = z.object({}).optional();

let settlementClock: () => Date = () => new Date();
export function configureSettlementClockForTests(clock: (() => Date) | undefined) {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("Settlement test seam only available in test mode");
  settlementClock = clock ?? (() => new Date());
}

type BalanceDb = Pick<Prisma.TransactionClient, "expense" | "settlement" | "familyMember">;
export async function getFamilyBalances(db: BalanceDb, familyId: string) {
  const [expenses, settlements] = await Promise.all([
    listSharedExpensesWithSplits(db, familyId),
    db.settlement.findMany({
      where: { familyId },
      include: {
        fromMember: { select: { formerAt: true } },
        toMember: { select: { formerAt: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const balances = computeBalances(
    expenses.map((expense) => ({
      visibility: expense.visibility,
      amountPaise: expense.amountPaise,
      memberId: expense.memberId,
      splits: expense.splits.map((split) => ({
        memberId: split.memberId,
        sharePaise: split.sharePaise,
      })),
    })),
    settlements.map(({ fromMemberId, toMemberId, amountPaise }) => ({
      fromMemberId,
      toMemberId,
      amountPaise,
    })),
  );
  return { balances, expenses, settlements };
}

export async function assertMemberSettled(db: BalanceDb, familyId: string, memberId: string) {
  const { balances } = await getFamilyBalances(db, familyId);
  const balance = balances.get(memberId) ?? 0;
  if (balance !== 0) {
    const rupees = fromPaise(Math.abs(balance)).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    throw httpError(`Settle up first: you have an outstanding balance of Rs ${rupees}.`, 409);
  }
}

export const getBalancesFn = createServerFn({ method: "GET" })
  .validator(balanceQuerySchema)
  .handler(async () => {
    const auth = await requireMember("readAll");
    const [{ balances, settlements }, members] = await Promise.all([
      getFamilyBalances(prisma, auth.familyId),
      prisma.familyMember.findMany({
        where: { familyId: auth.familyId },
        orderBy: [{ formerAt: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const rows = members.map((member) => ({
      memberId: member.id,
      name: member.formerAt ? `${member.displayName} (former member)` : member.displayName,
      former: member.formerAt !== null,
      netPaise: balances.get(member.id) ?? 0,
    }));
    for (const [memberId, netPaise] of balances) {
      if (!rows.some((row) => row.memberId === memberId))
        rows.push({ memberId, name: "Former member", former: true, netPaise });
    }
    return {
      members: rows,
      suggestedPayments: simplifyDebts(balances),
      settlements: settlements
        .slice(-30)
        .reverse()
        .map((item) => ({
          id: item.id,
          fromMemberId: item.fromMemberId,
          toMemberId: item.toMemberId,
          fromName: item.fromMember.formerAt
            ? `${item.fromNameSnapshot} (former member)`
            : item.fromNameSnapshot,
          toName: item.toMember.formerAt
            ? `${item.toNameSnapshot} (former member)`
            : item.toNameSnapshot,
          amountPaise: item.amountPaise,
          note: item.note,
          createdAt: item.createdAt.toISOString(),
          createdByMemberId: item.createdByMemberId,
        })),
    };
  });

async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "P2034" ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("Could not complete the settlement transaction");
}

export const recordSettlementFn = createServerFn({ method: "POST" })
  .validator(settlementInputSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("settlement:create");
    if (data.fromMemberId === data.toMemberId)
      throw httpError("Choose two different family members", 400);
    const amountPaise = toPaise(data.amount);
    await serializable(async (tx) => {
      const members = await tx.familyMember.findMany({
        where: {
          familyId: auth.familyId,
          formerAt: null,
          id: { in: [data.fromMemberId, data.toMemberId] },
        },
        select: { id: true, displayName: true },
      });
      if (members.length !== 2) throw notFound("Settlement member not found");
      const isParticipant =
        auth.memberId === data.fromMemberId || auth.memberId === data.toMemberId;
      assertCan(auth.role, isParticipant ? "settlement:create" : "settlement:manageAny");
      const from = members.find((member) => member.id === data.fromMemberId)!;
      const to = members.find((member) => member.id === data.toMemberId)!;
      const settlement = await tx.settlement.create({
        data: {
          familyId: auth.familyId,
          fromMemberId: from.id,
          toMemberId: to.id,
          fromNameSnapshot: from.displayName,
          toNameSnapshot: to.displayName,
          amountPaise,
          note: data.note,
          createdByMemberId: auth.memberId,
        },
      });
      await recordActivity(tx, auth, {
        type: "SETTLEMENT_RECORDED",
        entityType: "SETTLEMENT",
        entityId: settlement.id,
        summary: { amountPaise },
      });
    });
  });

export const deleteSettlementFn = createServerFn({ method: "POST" })
  .validator(settlementIdSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember();
    await serializable(async (tx) => {
      const settlement = await tx.settlement.findFirst({ where: { id, familyId: auth.familyId } });
      if (!settlement) throw notFound("Settlement not found");
      const isAdmin = can(auth.role, "settlement:deleteAny");
      if (!isAdmin) assertCan(auth.role, "settlement:deleteOwn");
      const isCreator =
        settlement.createdByMemberId === auth.memberId &&
        settlement.createdAt.getTime() + 24 * 60 * 60 * 1000 >= settlementClock().getTime();
      if (!isAdmin && !isCreator) {
        if (settlement.createdByMemberId === auth.memberId)
          throw httpError("Settlements can only be deleted by their creator within 24 hours", 403);
        throw httpError("You cannot delete this settlement", 403);
      }
      await tx.settlement.delete({ where: { id: settlement.id } });
      await recordActivity(tx, auth, {
        type: "SETTLEMENT_DELETED",
        entityType: "SETTLEMENT",
        entityId: settlement.id,
        summary: { amountPaise: settlement.amountPaise },
      });
    });
  });

export function getBalances() {
  return getBalancesFn({ data: undefined });
}
export function recordSettlement(input: z.infer<typeof settlementInputSchema>) {
  return recordSettlementFn({ data: input });
}
export function deleteSettlement(id: string) {
  return deleteSettlementFn({ data: id });
}
