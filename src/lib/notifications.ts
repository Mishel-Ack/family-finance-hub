import type { Prisma, PrismaClient } from "@prisma/client";

type NotificationDb =
  | Pick<PrismaClient, "notification" | "notificationPreference">
  | Pick<Prisma.TransactionClient, "notification" | "notificationPreference">;

export async function createInAppNotifications(
  db: NotificationDb,
  input: {
    familyId: string;
    userIds: string[];
    type: Prisma.NotificationCreateManyInput["type"];
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    dedupeKey: string;
  },
) {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  const preferences = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, type: input.type },
    select: { userId: true, inApp: true },
  });
  const disabled = new Set(
    preferences.filter((preference) => !preference.inApp).map((preference) => preference.userId),
  );
  const data: Prisma.NotificationCreateManyInput[] = userIds
    .filter((userId) => !disabled.has(userId))
    .map((userId) => ({
      familyId: input.familyId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
    }));
  if (data.length) await db.notification.createMany({ data, skipDuplicates: true });
}
