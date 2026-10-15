import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parseInput = (input: unknown) => input;
    const builder = {
      validator(schema: { parse: (input: unknown) => unknown }) {
        parseInput = (input) => schema.parse(input);
        return builder;
      },
      handler(handler: (options: { data: unknown }) => unknown) {
        return (options?: { data?: unknown }) =>
          Promise.resolve(parseInput(options?.data)).then((data) => handler({ data }));
      },
    };
    return builder;
  },
}));

import { prisma } from "@/lib/prisma";
import { createInAppNotifications } from "@/lib/notifications";
import { setAuthResolverForTests } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import {
  getNotificationPreferencesFn,
  updateNotificationPreferenceFn,
} from "@/services/notifications";
import { listRecurringSubscriptionsFn } from "@/services/subscriptions";
import {
  advanceRecurringSubscriptionFn,
  createManualRecurringSubscriptionFn,
  updateRecurringSubscriptionStatusFn,
} from "@/services/subscriptions";

describe("notifications and recurring subscriptions", () => {
  const suffix = crypto.randomUUID();
  let familyId = "";
  let userId = "";
  let memberId = "";
  let categoryId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Notification test",
        email: `notifications-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    userId = user.id;
    const family = await prisma.family.create({
      data: { name: `Notifications ${suffix}`, ownerId: userId },
    });
    familyId = family.id;
    const member = await prisma.familyMember.create({
      data: { familyId, userId, displayName: "Notification owner", role: "OWNER" },
    });
    memberId = member.id;
    const category = await prisma.category.create({ data: { familyId, name: "Household" } });
    categoryId = category.id;
    setAuthResolverForTests(async () => ({
      userId,
      familyId,
      memberId,
      role: "OWNER",
      user: { id: user.id, name: user.name, email: user.email },
    }));
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  it("honors per-user in-app preferences and deduplicates notifications", async () => {
    const defaults = await getNotificationPreferencesFn({ data: undefined });
    expect(defaults.every((preference) => preference.inApp)).toBe(true);
    await updateNotificationPreferenceFn({ data: { type: "INSIGHT", inApp: false } });
    expect(
      (await getNotificationPreferencesFn({ data: undefined })).find(
        (preference) => preference.type === "INSIGHT",
      )?.inApp,
    ).toBe(false);

    await createInAppNotifications(prisma, {
      familyId,
      userIds: [userId],
      type: "INSIGHT",
      title: "Disabled insight",
      body: "This should not be delivered.",
      dedupeKey: `insight-disabled-${suffix}`,
    });
    await createInAppNotifications(prisma, {
      familyId,
      userIds: [userId],
      type: "FAMILY_UPDATE",
      title: "Family update",
      body: "This should be delivered once.",
      dedupeKey: `family-update-${suffix}`,
    });
    await createInAppNotifications(prisma, {
      familyId,
      userIds: [userId],
      type: "FAMILY_UPDATE",
      title: "Duplicate family update",
      body: "Duplicate delivery should be ignored.",
      dedupeKey: `family-update-${suffix}`,
    });
    const rows = await prisma.notification.findMany({
      where: {
        familyId,
        userId,
        dedupeKey: { in: [`insight-disabled-${suffix}`, `family-update-${suffix}`] },
      },
    });
    expect(rows.map((row) => row.dedupeKey)).toEqual([`family-update-${suffix}`]);
  });

  it("detects recurring patterns from shared expenses without exposing private charges", async () => {
    const today = new Date();
    const sharedDates = [90, 60, 30].map(
      (daysAgo) =>
        new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo, 12),
        ),
    );
    await prisma.expense.createMany({
      data: [
        ...sharedDates.map((date) => ({
          familyId,
          userId,
          memberId,
          categoryId,
          amountPaise: 2_500,
          date,
          description: "Gym monthly",
          visibility: "SHARED" as const,
        })),
        ...sharedDates.map((date) => ({
          familyId,
          userId,
          memberId,
          categoryId,
          amountPaise: 800_000,
          date,
          description: "Private streaming",
          visibility: "PRIVATE" as const,
        })),
      ],
    });
    const patterns = await listRecurringSubscriptionsFn({ data: undefined });
    expect(patterns.map((pattern) => pattern.merchant)).toEqual(["gym monthly"]);
    expect(patterns[0]?.typicalAmountPaise).toBe(2_500);

    const pattern = patterns[0]!;
    await updateRecurringSubscriptionStatusFn({
      data: {
        merchant: pattern.merchant,
        status: "CONFIRMED",
        intervalDays: pattern.intervalDays,
        nextExpectedDate: pattern.nextExpectedDate,
        typicalAmountPaise: pattern.typicalAmountPaise,
      },
    });
    expect((await listRecurringSubscriptionsFn({ data: undefined }))[0]?.status).toBe("CONFIRMED");
    await updateRecurringSubscriptionStatusFn({
      data: { merchant: pattern.merchant, status: "DISMISSED" },
    });
    expect((await listRecurringSubscriptionsFn({ data: undefined }))[0]?.status).toBe("DISMISSED");
  });

  it("supports manually scheduled recurring payments and advancing the next date", async () => {
    const nextDay = new Date();
    nextDay.setUTCHours(0, 0, 0, 0);
    nextDay.setUTCDate(nextDay.getUTCDate() + 2);
    const nextExpectedDate = nextDay.toISOString().slice(0, 10);
    await createManualRecurringSubscriptionFn({
      data: {
        merchant: "Water Filter Service",
        intervalDays: 30,
        nextExpectedDate,
        typicalAmountPaise: 12_500,
      },
    });

    const patterns = await listRecurringSubscriptionsFn({ data: undefined });
    const manualPattern = patterns.find((pattern) => pattern.merchant === "water filter service");
    expect(manualPattern).toMatchObject({
      status: "CONFIRMED",
      intervalDays: 30,
      nextExpectedDate,
      typicalAmountPaise: 12_500,
    });
    await advanceRecurringSubscriptionFn({ data: "Water Filter Service" });
    const advanced = await listRecurringSubscriptionsFn({ data: undefined });
    expect(
      advanced.find((pattern) => pattern.merchant === "water filter service")?.nextExpectedDate,
    ).toBe(new Date(nextDay.getTime() + 30 * 86400000).toISOString().slice(0, 10));
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    if (familyId) await prisma.family.deleteMany({ where: { id: familyId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
});
