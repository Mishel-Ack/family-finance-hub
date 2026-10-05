import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/authz";
import { httpError } from "@/lib/http-error";

const paiseSchema = z.number().int().nonnegative();
const shortTextSchema = z.string().trim().max(80);
const roleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const inviteRoleSchema = z.enum(["ADMIN", "MEMBER", "VIEWER"]);
const dateParts = { month: z.number().int().min(1).max(12), year: z.number().int() };

const expenseSummary = z.object({
  amountPaise: paiseSchema,
  categoryName: shortTextSchema,
  description: shortTextSchema,
});

const ActivityEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EXPENSE_CREATED"),
    entityType: z.literal("EXPENSE"),
    entityId: z.string(),
    summary: expenseSummary,
  }),
  z.object({
    type: z.literal("EXPENSE_UPDATED"),
    entityType: z.literal("EXPENSE"),
    entityId: z.string(),
    summary: expenseSummary,
  }),
  z.object({
    type: z.literal("EXPENSE_DELETED"),
    entityType: z.literal("EXPENSE"),
    entityId: z.string(),
    summary: expenseSummary,
  }),
  z.object({
    type: z.literal("BUDGET_UPSERTED"),
    entityType: z.literal("BUDGET"),
    entityId: z.string(),
    summary: z.discriminatedUnion("operation", [
      z.object({
        operation: z.literal("TOTAL_LIMIT_SET"),
        ...dateParts,
        totalLimitPaise: paiseSchema,
      }),
      z.object({
        operation: z.literal("CATEGORY_LIMIT_SET"),
        ...dateParts,
        categoryName: shortTextSchema,
        limitPaise: paiseSchema,
      }),
      z.object({
        operation: z.literal("CATEGORY_LIMIT_REMOVED"),
        ...dateParts,
        categoryName: shortTextSchema,
      }),
    ]),
  }),
  z.object({
    type: z.literal("BUDGET_DELETED"),
    entityType: z.literal("BUDGET"),
    entityId: z.string(),
    summary: z.object(dateParts),
  }),
  z.object({
    type: z.literal("CATEGORY_CREATED"),
    entityType: z.literal("CATEGORY"),
    entityId: z.string(),
    summary: z.object({ categoryName: shortTextSchema }),
  }),
  z.object({
    type: z.literal("CATEGORY_UPDATED"),
    entityType: z.literal("CATEGORY"),
    entityId: z.string(),
    summary: z.object({ categoryName: shortTextSchema }),
  }),
  z.object({
    type: z.literal("CATEGORY_ARCHIVED"),
    entityType: z.literal("CATEGORY"),
    entityId: z.string(),
    summary: z.object({ categoryName: shortTextSchema }),
  }),
  z.object({
    type: z.literal("MEMBER_JOINED"),
    entityType: z.literal("MEMBER"),
    entityId: z.string(),
    summary: z.object({ displayName: shortTextSchema, role: roleSchema }),
  }),
  z.object({
    type: z.literal("MEMBER_LEFT"),
    entityType: z.literal("MEMBER"),
    entityId: z.string(),
    summary: z.object({ displayName: shortTextSchema }),
  }),
  z.object({
    type: z.literal("MEMBER_REMOVED"),
    entityType: z.literal("MEMBER"),
    entityId: z.string(),
    summary: z.object({ displayName: shortTextSchema, role: roleSchema }),
  }),
  z.object({
    type: z.literal("MEMBER_ROLE_CHANGED"),
    entityType: z.literal("MEMBER"),
    entityId: z.string(),
    summary: z.object({ displayName: shortTextSchema, oldRole: roleSchema, newRole: roleSchema }),
  }),
  z.object({
    type: z.literal("OWNERSHIP_TRANSFERRED"),
    entityType: z.literal("FAMILY"),
    entityId: z.string(),
    summary: z.object({ oldOwnerName: shortTextSchema, newOwnerName: shortTextSchema }),
  }),
  z.object({
    type: z.literal("INVITE_CREATED"),
    entityType: z.literal("INVITE"),
    entityId: z.string(),
    summary: z.object({ role: inviteRoleSchema }),
  }),
  z.object({
    type: z.literal("INVITE_REVOKED"),
    entityType: z.literal("INVITE"),
    entityId: z.string(),
    summary: z.object({ role: inviteRoleSchema }),
  }),
  z.object({
    type: z.literal("SPLIT_CREATED"),
    entityType: z.literal("SPLIT"),
    entityId: z.string().nullable(),
    summary: z.object({
      amountPaise: paiseSchema,
      participantCount: z.number().int().positive(),
      mode: z.enum(["EQUAL", "EXACT", "PERCENT"]),
    }),
  }),
  z.object({
    type: z.literal("SPLIT_REMOVED"),
    entityType: z.literal("SPLIT"),
    entityId: z.string().nullable(),
    summary: z.object({ amountPaise: paiseSchema }),
  }),
  z.object({
    type: z.literal("SETTLEMENT_RECORDED"),
    entityType: z.literal("SETTLEMENT"),
    entityId: z.string().nullable(),
    summary: z.object({ amountPaise: paiseSchema }),
  }),
  z.object({
    type: z.literal("SETTLEMENT_DELETED"),
    entityType: z.literal("SETTLEMENT"),
    entityId: z.string().nullable(),
    summary: z.object({ amountPaise: paiseSchema }),
  }),
]);

export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
export type ActivityGroup = "EXPENSES" | "BUDGETS" | "CATEGORIES" | "MEMBERS";
export type ActivityType = ActivityEntry["type"];
export type ActivityFilter = ActivityType | ActivityGroup;
export type ActivityItem = ActivityEntry & {
  id: string;
  actorMemberId: string | null;
  actorName: string;
  createdAt: string;
};

export const activityListSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  memberId: z.string().uuid().optional(),
  type: z
    .enum([
      "EXPENSES",
      "BUDGETS",
      "CATEGORIES",
      "MEMBERS",
      "EXPENSE_CREATED",
      "EXPENSE_UPDATED",
      "EXPENSE_DELETED",
      "BUDGET_UPSERTED",
      "BUDGET_DELETED",
      "CATEGORY_CREATED",
      "CATEGORY_UPDATED",
      "CATEGORY_ARCHIVED",
      "MEMBER_JOINED",
      "MEMBER_LEFT",
      "MEMBER_REMOVED",
      "MEMBER_ROLE_CHANGED",
      "OWNERSHIP_TRANSFERRED",
      "INVITE_CREATED",
      "INVITE_REVOKED",
      "SPLIT_CREATED",
      "SPLIT_REMOVED",
      "SETTLEMENT_RECORDED",
      "SETTLEMENT_DELETED",
    ])
    .optional(),
  entityType: z
    .enum(["EXPENSE", "BUDGET", "CATEGORY", "MEMBER", "FAMILY", "INVITE", "SPLIT", "SETTLEMENT"])
    .optional(),
  entityId: z.string().optional(),
});
export const activitySearchSchema = activityListSchema.pick({ memberId: true, type: true });

type Cursor = { createdAt: Date; id: string };
const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().min(1) });
const groupTypes: Record<ActivityGroup, ActivityType[]> = {
  EXPENSES: ["EXPENSE_CREATED", "EXPENSE_UPDATED", "EXPENSE_DELETED"],
  BUDGETS: ["BUDGET_UPSERTED", "BUDGET_DELETED"],
  CATEGORIES: ["CATEGORY_CREATED", "CATEGORY_UPDATED", "CATEGORY_ARCHIVED"],
  MEMBERS: [
    "MEMBER_JOINED",
    "MEMBER_LEFT",
    "MEMBER_REMOVED",
    "MEMBER_ROLE_CHANGED",
    "OWNERSHIP_TRANSFERRED",
  ],
};
const inviteTypes: ActivityType[] = ["INVITE_CREATED", "INVITE_REVOKED"];
type ActivityTransaction = Prisma.TransactionClient;

interface ActivityTestHooks {
  beforeRecord?: (() => void | Promise<void>) | undefined;
  afterRecord?: (() => void | Promise<void>) | undefined;
  createdAt?: Date | undefined;
}
let activityTestHooks: ActivityTestHooks = {};

export function configureActivityTests(hooks: ActivityTestHooks) {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("Activity test seam only available in test mode");
  activityTestHooks = hooks;
}

export async function recordActivity(
  tx: ActivityTransaction,
  auth: AuthContext,
  input: ActivityEntry,
): Promise<void> {
  const entry = ActivityEntrySchema.parse(input);
  const actor = await tx.familyMember.findFirst({
    where: { id: auth.memberId, familyId: auth.familyId },
    select: { displayName: true },
  });
  if (!actor) throw httpError("Activity actor is no longer a family member", 409);
  await activityTestHooks.beforeRecord?.();
  await tx.activityLog.create({
    data: {
      familyId: auth.familyId,
      actorMemberId: auth.memberId,
      actorNameSnapshot: actor.displayName || auth.user.name,
      type: entry.type,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary as Prisma.InputJsonValue,
      ...(activityTestHooks.createdAt ? { createdAt: activityTestHooks.createdAt } : {}),
    },
  });
  await activityTestHooks.afterRecord?.();
}

export async function redactExpenseActivity(
  tx: ActivityTransaction,
  familyId: string,
  expenseId: string,
): Promise<void> {
  await tx.activityLog.deleteMany({
    where: { familyId, entityType: "EXPENSE", entityId: expenseId },
  });
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const cursor = cursorSchema.parse(parsed);
    return { createdAt: new Date(cursor.createdAt), id: cursor.id };
  } catch {
    throw httpError("Invalid activity cursor", 400);
  }
}

function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString("base64url");
}

export async function listActivity(auth: AuthContext, options: z.infer<typeof activityListSchema>) {
  const cursor = decodeCursor(options.cursor);
  const typeFilter = options.type
    ? options.type in groupTypes
      ? groupTypes[options.type as ActivityGroup]
      : [options.type as ActivityType]
    : undefined;
  const types = typeFilter
    ? typeFilter.filter(
        (type) => auth.role === "OWNER" || auth.role === "ADMIN" || !inviteTypes.includes(type),
      )
    : auth.role === "OWNER" || auth.role === "ADMIN"
      ? undefined
      : (Object.values(groupTypes)
          .flat()
          .filter((type) => !inviteTypes.includes(type)) as ActivityType[]);
  const clauses: Prisma.ActivityLogWhereInput[] = [{ familyId: auth.familyId }];
  if (options.memberId) clauses.push({ actorMemberId: options.memberId });
  if (options.entityType) clauses.push({ entityType: options.entityType });
  if (options.entityId) clauses.push({ entityId: options.entityId });
  if (types) clauses.push({ type: { in: types } });
  if (cursor) {
    clauses.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });
  }

  const rows = await prisma.activityLog.findMany({
    where: { AND: clauses },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit + 1,
    include: { actorMember: { select: { formerAt: true } } },
  });
  const hasMore = rows.length > options.limit;
  const page = rows.slice(0, options.limit);
  const items: ActivityItem[] = page.map((row) => {
    const entry = ActivityEntrySchema.parse({
      type: row.type,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
    });
    return {
      id: row.id,
      actorMemberId: row.actorMemberId,
      actorName:
        row.actorMemberId && !row.actorMember?.formerAt
          ? row.actorNameSnapshot
          : `${row.actorNameSnapshot} (former member)`,
      createdAt: row.createdAt.toISOString(),
      ...entry,
    };
  });
  return {
    items,
    nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
    hasMore,
  };
}
