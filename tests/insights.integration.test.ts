import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: <T>(fn: T): T => fn,
  createServerFn: () => {
    let parseInput = (input: unknown) => input;
    const builder = {
      validator(schema: { parse: (input: unknown) => unknown }) {
        parseInput = (input: unknown) => schema.parse(input);
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
import { setAuthResolverForTests } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import { dismissInsightFn, listInsightsFn, recomputeInsights } from "@/services/insights";

describe("shared-data insights", () => {
  const suffix = crypto.randomUUID();
  let familyId = "";
  let ownerId = "";
  let memberId = "";
  let categoryId = "";

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        name: "Insights test",
        email: `insights-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    ownerId = owner.id;
    const family = await prisma.family.create({ data: { name: `Insights ${suffix}`, ownerId } });
    familyId = family.id;
    const member = await prisma.familyMember.create({
      data: { familyId, userId: ownerId, displayName: "Insights owner", role: "OWNER" },
    });
    memberId = member.id;
    const category = await prisma.category.create({ data: { familyId, name: "Food" } });
    categoryId = category.id;
    const now = new Date();
    const monthBudgets = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      return {
        familyId,
        month: date.getUTCMonth() + 1,
        year: date.getUTCFullYear(),
        totalLimitPaise: 1_000_000,
      };
    });
    await prisma.budget.createMany({ data: monthBudgets, skipDuplicates: true });
    const sharedMonths = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - offset,
          Math.min(5, now.getUTCDate()),
          12,
        ),
      );
      return {
        familyId,
        userId: ownerId,
        memberId,
        categoryId,
        amountPaise: offset === 0 ? 900_000 : 100_000 + offset * 5_000,
        date,
        description: "Shared family groceries",
        visibility: "SHARED" as const,
      };
    });
    await prisma.expense.createMany({ data: sharedMonths });
    setAuthResolverForTests(async () => ({
      userId: ownerId,
      familyId,
      memberId,
      role: "OWNER",
      user: { id: owner.id, name: owner.name, email: owner.email },
    }));
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  it("ignores private expenses, recomputes idempotently, and preserves dismissal when the payload is unchanged", async () => {
    await recomputeInsights(familyId);
    const sharedOnly = await prisma.insight.findMany({
      where: { familyId },
      select: { id: true, type: true, key: true, payload: true, severity: true },
      orderBy: [{ type: "asc" }, { key: "asc" }],
    });
    expect(sharedOnly.length).toBeGreaterThan(0);
    const totalShared = await prisma.expense.aggregate({
      where: { familyId, visibility: "SHARED" },
      _sum: { amountPaise: true },
    });
    await prisma.expense.create({
      data: {
        familyId,
        userId: ownerId,
        memberId,
        categoryId,
        amountPaise: 99_999_900,
        date: new Date(),
        description: "PRIVATE SHOULD NOT LEAK",
        visibility: "PRIVATE",
      },
    });
    await recomputeInsights(familyId);
    const afterPrivate = await prisma.insight.findMany({
      where: { familyId },
      select: { id: true, type: true, key: true, payload: true, severity: true },
      orderBy: [{ type: "asc" }, { key: "asc" }],
    });
    expect(afterPrivate).toEqual(sharedOnly);
    expect(JSON.stringify(afterPrivate)).not.toContain("PRIVATE SHOULD NOT LEAK");
    expect(
      (
        await prisma.expense.aggregate({
          where: { familyId, visibility: "SHARED" },
          _sum: { amountPaise: true },
        })
      )._sum.amountPaise,
    ).toBe(totalShared._sum.amountPaise);

    const dismissible =
      afterPrivate.find((item) => item.type === "MID_MONTH_OVERSPEND") ?? afterPrivate[0]!;
    await dismissInsightFn({ data: dismissible.id });
    await recomputeInsights(familyId);
    const dismissed = await prisma.insight.findFirst({ where: { id: dismissible.id, familyId } });
    expect(dismissed?.dismissedAt).not.toBeNull();
    const visible = await listInsightsFn({ data: undefined });
    expect(visible.some((item) => item.id === dismissible.id)).toBe(false);
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    if (familyId) await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.user.deleteMany({ where: { email: `insights-${suffix}@example.test` } });
  });
});
