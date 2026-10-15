import type { Prisma } from "@prisma/client";
import { createInAppNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { listRecentNotificationActivity } from "@/lib/activity-queries";
import { recomputeInsights } from "@/services/insights";

function insightNotification(type: string): {
  type: "RECURRING_REMINDER" | "ANOMALY" | "INSIGHT";
  title: string;
} {
  if (type === "RECURRING_BILL") {
    return { type: "RECURRING_REMINDER", title: "Recurring bill coming up" };
  }
  if (["CATEGORY_ANOMALY", "DUPLICATE_CHARGE", "PRICE_INCREASE"].includes(type)) {
    return { type: "ANOMALY", title: "Unusual spending detected" };
  }
  return { type: "INSIGHT", title: "New family finance insight" };
}

function payloadReason(payload: Prisma.JsonValue): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "reason" in payload &&
    typeof payload["reason"] === "string"
  ) {
    return payload["reason"].slice(0, 300);
  }
  return "Review the latest shared family finance insight.";
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(from: Date, to: Date) {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
}

export async function runNotificationJobs() {
  const families = await prisma.family.findMany({ select: { id: true } });
  const generatedAt = new Date();
  const recentSince = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
  let generated = 0;

  for (const { id: familyId } of families) {
    await recomputeInsights(familyId);
    const [members, insights, reports, funds, activities] = await Promise.all([
      prisma.familyMember.findMany({
        where: { familyId, userId: { not: null } },
        select: { userId: true },
      }),
      prisma.insight.findMany({
        where: { familyId, dismissedAt: null },
        select: { id: true, type: true, key: true, payload: true },
      }),
      prisma.monthlyReport.findMany({
        where: { familyId, generatedAt: { gte: recentSince } },
        select: { month: true, year: true },
      }),
      prisma.sinkingFund.findMany({
        where: {
          familyId,
          archivedAt: null,
          dueDate: { lte: new Date(generatedAt.getTime() + 60 * 86400000) },
        },
        include: {
          contributions: { where: { familyId }, select: { amountPaise: true } },
        },
      }),
      listRecentNotificationActivity(familyId, recentSince),
    ]);
    const userIds = [...new Set(members.flatMap(({ userId }) => (userId ? [userId] : [])))];
    if (!userIds.length) continue;

    for (const insight of insights) {
      const notification = insightNotification(insight.type);
      await createInAppNotifications(prisma, {
        familyId,
        userIds,
        type: notification.type,
        title: notification.title,
        body: payloadReason(insight.payload),
        entityType: "INSIGHT",
        entityId: insight.id,
        dedupeKey: `insight:${insight.type}:${insight.key}`,
      });
      generated++;
    }

    for (const report of reports) {
      await createInAppNotifications(prisma, {
        familyId,
        userIds,
        type: "MONTHLY_STORY_READY",
        title: "Monthly money story ready",
        body: `The shared family money story for ${report.month}/${report.year} is ready.`,
        entityType: "MONTHLY_REPORT",
        dedupeKey: `monthly-story:${report.year}-${report.month}`,
      });
      generated++;
    }

    const currentMonth = new Date(
      Date.UTC(generatedAt.getUTCFullYear(), generatedAt.getUTCMonth(), 1),
    );
    for (const fund of funds) {
      const monthsToDue = Math.max(1, monthsBetween(currentMonth, fund.dueDate));
      const totalMonths = Math.max(1, monthsBetween(fund.createdAt, fund.dueDate));
      const elapsedMonths = Math.min(
        totalMonths,
        Math.max(0, monthsBetween(fund.createdAt, currentMonth) + 1),
      );
      const contributedPaise = fund.contributions.reduce(
        (sum, contribution) => sum + contribution.amountPaise,
        0,
      );
      const expectedPaise = Math.ceil((fund.targetPaise * elapsedMonths) / totalMonths);
      if (monthsToDue > 2 || contributedPaise >= expectedPaise) continue;
      await createInAppNotifications(prisma, {
        familyId,
        userIds,
        type: "FUND_OFF_TRACK",
        title: `${fund.name} may be behind schedule`,
        body: `Contributions are ${Math.max(0, expectedPaise - contributedPaise)} paise below the planned pace.`,
        entityType: "SINKING_FUND",
        entityId: fund.id,
        dedupeKey: `fund-off-track:${fund.id}:${monthKey(generatedAt)}`,
      });
      generated++;
    }

    for (const activity of activities) {
      const memberJoined = activity.type === "MEMBER_JOINED";
      await createInAppNotifications(prisma, {
        familyId,
        userIds,
        type: memberJoined ? "MEMBER_JOINED" : "SETTLEMENT",
        title: memberJoined ? "A member joined the family" : "A settlement was recorded",
        body: memberJoined
          ? "A new member has joined your family."
          : "A family settlement was recorded.",
        entityType: memberJoined ? "MEMBER" : "SETTLEMENT",
        ...(activity.entityId ? { entityId: activity.entityId } : {}),
        dedupeKey: `activity:${activity.id}`,
      });
      generated++;
    }
  }

  return { familiesProcessed: families.length, notificationGroupsProcessed: generated };
}
