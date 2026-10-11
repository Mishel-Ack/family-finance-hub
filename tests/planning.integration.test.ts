import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
import { setAuthResolverForTests } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import {
  contributeToFundFn,
  createGoalFn,
  createSinkingFundFn,
  getPlanningAssetsFn,
} from "@/services/planning-assets";
import { generateFamilyStoryFn, getFamilyStoryFn } from "@/services/family-story";

describe("family planning assets", () => {
  const suffix = crypto.randomUUID();
  let familyId = "";
  let ownerId = "";
  let memberId = "";
  let fundId = "";
  let categoryId = "";

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        name: "Planning test",
        email: `planning-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    ownerId = owner.id;
    const family = await prisma.family.create({ data: { name: `Planning ${suffix}`, ownerId } });
    familyId = family.id;
    const member = await prisma.familyMember.create({
      data: { familyId, userId: ownerId, displayName: "Planning owner", role: "OWNER" },
    });
    memberId = member.id;
    const category = await prisma.category.create({ data: { familyId, name: "Food" } });
    categoryId = category.id;
    setAuthResolverForTests(async () => ({
      userId: ownerId,
      familyId,
      memberId,
      role: "OWNER",
      user: { id: owner.id, name: owner.name, email: owner.email },
    }));
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  it("family-scopes funds and computes contributions and monthly set-asides", async () => {
    const fund = await createSinkingFundFn({
      data: { name: "School fees", targetPaise: 120_000, dueDate: "2027-01-01" },
    });
    fundId = fund.id;
    await contributeToFundFn({ data: { fundId, amountPaise: 20_000 } });
    await createGoalFn({
      data: { name: "Emergency", targetPaise: 500_000, targetDate: "2027-01-01" },
    });
    const assets = await getPlanningAssetsFn({ data: undefined });
    expect(assets.funds).toHaveLength(1);
    expect(assets.funds[0]?.contributedPaise).toBe(20_000);
    expect(assets.funds[0]?.monthlySetAsidePaise).toBeGreaterThan(0);
    expect(assets.goals).toHaveLength(1);
    expect(assets.goals[0]?.monthlyPlanPaise).toBeGreaterThan(0);
  });

  it("generates an idempotent money story from shared rows only", async () => {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    await prisma.expense.createMany({
      data: [
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 12_300,
          date: new Date(Date.UTC(year, month - 1, 4, 12)),
          description: "Shared groceries",
          visibility: "SHARED",
        },
        {
          familyId,
          userId: ownerId,
          memberId,
          categoryId,
          amountPaise: 999_999_999,
          date: new Date(Date.UTC(year, month - 1, 5, 12)),
          description: "Private purchase",
          visibility: "PRIVATE",
        },
      ],
    });
    const first = await generateFamilyStoryFn({ data: { month, year } });
    const second = await generateFamilyStoryFn({ data: { month, year } });
    expect(second.id).toBe(first.id);
    const data = z.object({ totalPaise: z.number(), expenseCount: z.number() }).parse(first.data);
    const rawShared = await prisma.expense.aggregate({
      where: { familyId, visibility: "SHARED" },
      _sum: { amountPaise: true },
      _count: true,
    });
    expect(data.totalPaise).toBe(rawShared._sum.amountPaise);
    expect(data.expenseCount).toBe(rawShared._count);
    const visible = await getFamilyStoryFn({ data: { month, year } });
    expect(visible?.id).toBe(first.id);
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    if (familyId) await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.user.deleteMany({ where: { email: `planning-${suffix}@example.test` } });
  });
});
