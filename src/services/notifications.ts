import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { idSchema } from "@/lib/validations";
import { notFound } from "@/lib/http-error";
import { prisma } from "@/lib/prisma";

export const notificationTypes = [
  "PURCHASE_REQUEST",
  "PURCHASE_DECISION",
  "BUDGET_ALERT",
  "RECURRING_REMINDER",
  "INSIGHT",
  "FAMILY_UPDATE",
  "MONTHLY_STORY_READY",
  "FUND_OFF_TRACK",
  "ANOMALY",
  "MEMBER_JOINED",
  "SETTLEMENT",
] as const;
export type NotificationPreferenceType = (typeof notificationTypes)[number];

export const listNotificationsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("notification:read");
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { familyId: auth.familyId, userId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({
        where: { familyId: auth.familyId, userId: auth.userId, readAt: null },
      }),
    ]);
    return { items, unreadCount };
  });

export const getNotificationPreferencesFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("notification:read");
    const saved = await prisma.notificationPreference.findMany({
      where: { userId: auth.userId },
      select: { type: true, inApp: true },
    });
    const byType = new Map(saved.map((preference) => [preference.type, preference.inApp]));
    return notificationTypes.map((type) => ({
      type,
      inApp: byType.get(type) ?? true,
    }));
  });

export const updateNotificationPreferenceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      type: z.enum(notificationTypes),
      inApp: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("notification:read");
    return prisma.notificationPreference.upsert({
      where: { userId_type: { userId: auth.userId, type: data.type } },
      create: { userId: auth.userId, type: data.type, inApp: data.inApp },
      update: { inApp: data.inApp },
      select: { type: true, inApp: true },
    });
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator(idSchema)
  .handler(async ({ data: id }) => {
    assertSameOrigin();
    const auth = await requireMember("notification:read");
    const updated = await prisma.notification.updateMany({
      where: { id, familyId: auth.familyId, userId: auth.userId },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw notFound("Notification not found");
    return { success: true };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .validator(z.undefined().optional())
  .handler(async () => {
    assertSameOrigin();
    const auth = await requireMember("notification:read");
    await prisma.notification.updateMany({
      where: { familyId: auth.familyId, userId: auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  });

export function listNotifications() {
  return listNotificationsFn({ data: undefined });
}
export function getNotificationPreferences() {
  return getNotificationPreferencesFn({ data: undefined });
}
export function updateNotificationPreference(input: {
  type: NotificationPreferenceType;
  inApp: boolean;
}) {
  return updateNotificationPreferenceFn({ data: input });
}
export function markNotificationRead(id: string) {
  return markNotificationReadFn({ data: id });
}
export function markAllNotificationsRead() {
  return markAllNotificationsReadFn({ data: undefined });
}
