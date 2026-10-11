import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMember } from "@/lib/authz";
import { assertSameOrigin } from "@/lib/http-utils";
import { idSchema } from "@/lib/validations";
import { notFound } from "@/lib/http-error";
import { prisma } from "@/lib/prisma";

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
export function markNotificationRead(id: string) {
  return markNotificationReadFn({ data: id });
}
export function markAllNotificationsRead() {
  return markAllNotificationsReadFn({ data: undefined });
}
