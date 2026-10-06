import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parseInput = (input: unknown) => input;
    const builder = {
      validator(schema: { parse: (input: unknown) => unknown }) {
        parseInput = (input: unknown) => schema.parse(input);
        return builder;
      },
      handler(handler: (options: { data: unknown }) => unknown) {
        const serverFunction = (options?: { data?: unknown }) =>
          Promise.resolve(parseInput(options?.data)).then((data) => handler({ data }));
        Object.defineProperty(serverFunction, "__serverFunction", { value: true });
        return serverFunction;
      },
    };
    return builder;
  },
}));

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { prisma } from "@/lib/prisma";
import { setAuthResolverForTests } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import { hashInviteToken } from "@/lib/invite-acceptance";

const serviceModules = import.meta.glob("../src/services/*.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;
const srcRoot = join(process.cwd(), "src");
const declarationPattern = /export const (\w+) = createServerFn\(\{ method: "(GET|POST)" \}\)/g;
type ServerFunction = ((options?: { data?: unknown }) => Promise<unknown>) & {
  __serverFunction?: boolean;
};

function sourceDeclarations(): Map<string, { method: "GET" | "POST"; file: string }> {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.[cm]?tsx?$/.test(entry.name)) files.push(path);
    }
  };
  visit(join(srcRoot, "services"));
  visit(join(srcRoot, "routes"));
  const declarations = new Map<string, { method: "GET" | "POST"; file: string }>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(declarationPattern)) {
      declarations.set(match[1]!, {
        method: match[2] as "GET" | "POST",
        file: relative(srcRoot, file).replaceAll("\\", "/"),
      });
    }
  }
  return declarations;
}

const endpoints = new Map<string, ServerFunction>();
for (const module of Object.values(serviceModules)) {
  for (const [name, value] of Object.entries(module)) {
    if (typeof value === "function" && (value as ServerFunction).__serverFunction) {
      endpoints.set(name, value as ServerFunction);
    }
  }
}

const validInputs: Record<string, unknown> = {
  getBalancesFn: undefined,
  listCategoriesFn: undefined,
  listExpensesFn: undefined,
  getProfileFn: undefined,
  getMembershipFn: undefined,
  listFamilyMembersFn: undefined,
  listPendingInvitesFn: undefined,
  loginFn: { email: "missing@example.test", password: "wrong-password" },
  registerFn: {
    name: "Security Test",
    email: "security-test@example.test",
    password: "password-123",
  },
  registerWithInviteFn: {
    name: "Security Test",
    email: "security-invite@example.test",
    password: "password-123",
    token: "a".repeat(40),
  },
  getInviteDetailsFn: "a".repeat(40),
  acceptInviteFn: { token: "a".repeat(40), leaveExistingFamily: false },
  getBudgetFn: { month: 10, year: 2026 },
  upsertBudgetFn: { month: 10, year: 2026, totalLimit: 100 },
  getMonthlySummaryFn: { month: 10, year: 2026 },
  getYearlyTrendFn: 2026,
  listActivityFn: { limit: 20 },
  createExpenseFn: {
    amount: 1,
    categoryId: "00000000-0000-4000-8000-000000000001",
    date: "2026-10-06",
  },
  updateExpenseFn: {
    id: "00000000-0000-4000-8000-000000000001",
    input: { amount: 1, categoryId: "00000000-0000-4000-8000-000000000001", date: "2026-10-06" },
  },
  deleteExpenseFn: "00000000-0000-4000-8000-000000000001",
  recordSettlementFn: {
    fromMemberId: "00000000-0000-4000-8000-000000000001",
    toMemberId: "00000000-0000-4000-8000-000000000002",
    amount: 1,
  },
  deleteSettlementFn: "00000000-0000-4000-8000-000000000001",
  updateProfileNameFn: "Updated Name",
  updateOwnDisplayNameFn: "Updated Name",
  addFamilyMemberFn: { displayName: "New Member", role: "MEMBER" },
  removeFamilyMemberFn: "00000000-0000-4000-8000-000000000001",
  changeFamilyMemberRoleFn: { id: "00000000-0000-4000-8000-000000000001", role: "MEMBER" },
  leaveFamilyFn: undefined,
  transferOwnershipFn: {
    targetMemberId: "00000000-0000-4000-8000-000000000001",
    familyNameConfirmation: "Demo Family",
  },
  createFamilyFn: "Demo Family",
  renameFamilyFn: "Renamed Family",
  createCategoryFn: { name: "Test Category" },
  updateCategoryFn: { id: "00000000-0000-4000-8000-000000000001", input: { name: "New Category" } },
  archiveCategoryFn: "00000000-0000-4000-8000-000000000001",
  deleteCategoryFn: "00000000-0000-4000-8000-000000000001",
  deleteBudgetFn: "00000000-0000-4000-8000-000000000001",
  listBudgetCategoriesFn: "00000000-0000-4000-8000-000000000001",
  upsertBudgetCategoryFn: {
    budgetId: "00000000-0000-4000-8000-000000000001",
    categoryId: "00000000-0000-4000-8000-000000000002",
    limitAmount: 10,
  },
  deleteBudgetCategoryFn: "00000000-0000-4000-8000-000000000001",
  createInviteFn: { role: "MEMBER", email: "test@example.com" },
  revokeInviteFn: "00000000-0000-4000-8000-000000000001",
};

const intentionallyPublic = new Set([
  "getSessionFn",
  "loginFn",
  "registerFn",
  "registerWithInviteFn",
  "getInviteDetailsFn",
  "acceptInviteFn",
  "logoutFn",
]);

function inputFor(name: string): unknown {
  return Object.hasOwn(validInputs, name) ? validInputs[name] : undefined;
}

function statusCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "statusCode" in error
    ? Number(error.statusCode)
    : undefined;
}

describe("server-function security coverage", () => {
  beforeEach(() => {
    setAuthResolverForTests(async () => null);
    process.env["APP_ORIGIN"] = "http://familybudget.test";
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    await prisma.family.deleteMany({ where: { name: { in: ["Security A", "Security B"] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "security-a-" } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "security-b-" } } });
    await prisma.user.deleteMany({
      where: { email: { in: ["security-test@example.test", "security-invite@example.test"] } },
    });
  });

  it("automatically discovers every server function and requires anonymous access classification", async () => {
    const declarations = sourceDeclarations();
    expect([...endpoints.keys()].sort()).toEqual([...declarations.keys()].sort());
    const unclassified = [...declarations.keys()].filter(
      (name) => !Object.hasOwn(validInputs, name) && !intentionallyPublic.has(name),
    );
    expect(
      unclassified,
      "Add valid fixture input or document an intentional public exception",
    ).toEqual([]);

    const unauthenticated = [...declarations.keys()].filter(
      (name) => !intentionallyPublic.has(name),
    );
    for (const name of unauthenticated) {
      const endpoint = endpoints.get(name)!;
      let error: unknown;
      try {
        await endpoint({ data: inputFor(name) });
      } catch (caught) {
        error = caught;
      }
      expect(error, `${name} must reject an unauthenticated request`).toBeDefined();
      expect(statusCode(error), `${name} should reject as unauthenticated`).toBe(401);
    }
  });

  it("automatically checks every state-changing server function rejects a foreign Origin", async () => {
    const writes = [...sourceDeclarations()].filter(
      ([, declaration]) => declaration.method === "POST",
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const [name] of writes) {
      setHeadersForTests({ origin: "https://attacker.invalid", host: "familybudget.test" });
      let error: unknown;
      try {
        await endpoints.get(name)!({ data: inputFor(name) });
      } catch (caught) {
        error = caught;
      }
      expect(error, `${name} must reject a cross-origin write`).toBeDefined();
      expect(statusCode(error), `${name} cross-origin status`).toBe(403);
      setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
    }
  });

  it("returns not-found or empty results for foreign-family identifiers across ID-taking endpoints", async () => {
    const suffix = crypto.randomUUID();
    const ownerA = await prisma.user.create({
      data: {
        name: "Security A",
        email: `security-a-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    const ownerB = await prisma.user.create({
      data: {
        name: "Security B",
        email: `security-b-${suffix}@example.test`,
        passwordHash: "unused",
      },
    });
    const familyA = await prisma.family.create({
      data: { name: "Security A", ownerId: ownerA.id },
    });
    const familyB = await prisma.family.create({
      data: { name: "Security B", ownerId: ownerB.id },
    });
    const [memberA, memberB, extraB] = await Promise.all([
      prisma.familyMember.create({
        data: { familyId: familyA.id, userId: ownerA.id, displayName: "A Owner", role: "OWNER" },
      }),
      prisma.familyMember.create({
        data: { familyId: familyB.id, userId: ownerB.id, displayName: "B Owner", role: "OWNER" },
      }),
      prisma.familyMember.create({
        data: { familyId: familyB.id, displayName: "B Member", role: "MEMBER" },
      }),
    ]);
    const categoryA = await prisma.category.create({
      data: { familyId: familyA.id, name: "A Category" },
    });
    const categoryB = await prisma.category.create({
      data: { familyId: familyB.id, name: "B Category" },
    });
    const budgetB = await prisma.budget.create({
      data: { familyId: familyB.id, month: 10, year: 2026, totalLimitPaise: 10000 },
    });
    const budgetCategoryB = await prisma.budgetCategory.create({
      data: { budgetId: budgetB.id, categoryId: categoryB.id, limitAmountPaise: 1000 },
    });
    const expenseB = await prisma.expense.create({
      data: {
        familyId: familyB.id,
        userId: ownerB.id,
        memberId: memberB.id,
        categoryId: categoryB.id,
        amountPaise: 100,
      },
    });
    const inviteB = await prisma.invite.create({
      data: {
        familyId: familyB.id,
        role: "MEMBER",
        tokenHash: hashInviteToken(`security-${suffix}`),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const settlementB = await prisma.settlement.create({
      data: {
        familyId: familyB.id,
        fromMemberId: memberB.id,
        toMemberId: extraB.id,
        fromNameSnapshot: "B Owner",
        toNameSnapshot: "B Member",
        amountPaise: 1,
      },
    });

    setAuthResolverForTests(async () => ({
      userId: ownerA.id,
      familyId: familyA.id,
      memberId: memberA.id,
      role: "OWNER",
      user: { id: ownerA.id, name: ownerA.name, email: ownerA.email },
    }));
    // Filters that intentionally return an empty collection instead of 404 are checked separately below.
    const crossFamilyCalls: Record<string, unknown> = {
      listBudgetCategoriesFn: budgetB.id,
      deleteBudgetFn: budgetB.id,
      upsertBudgetCategoryFn: { budgetId: budgetB.id, categoryId: categoryB.id, limitAmount: 10 },
      deleteBudgetCategoryFn: budgetCategoryB.id,
      updateExpenseFn: {
        id: expenseB.id,
        input: { amount: 1, categoryId: categoryA.id, date: "2026-10-06" },
      },
      deleteExpenseFn: expenseB.id,
      createExpenseFn: {
        amount: 1,
        categoryId: categoryA.id,
        date: "2026-10-06",
        split: { mode: "EQUAL", memberIds: [memberB.id] },
      },
      updateCategoryFn: { id: categoryB.id, input: { name: "Cross Family" } },
      archiveCategoryFn: categoryB.id,
      deleteCategoryFn: categoryB.id,
      removeFamilyMemberFn: memberB.id,
      changeFamilyMemberRoleFn: { id: memberB.id, role: "VIEWER" },
      transferOwnershipFn: { targetMemberId: memberB.id, familyNameConfirmation: familyA.name },
      revokeInviteFn: inviteB.id,
      deleteSettlementFn: settlementB.id,
      recordSettlementFn: { fromMemberId: memberB.id, toMemberId: extraB.id, amount: 1 },
    };
    // The registry is deliberately exhaustive: a new ID-accepting endpoint must add a case here.
    const idEndpoints = [
      "listBudgetCategoriesFn",
      "deleteBudgetFn",
      "upsertBudgetCategoryFn",
      "deleteBudgetCategoryFn",
      "updateExpenseFn",
      "deleteExpenseFn",
      "createExpenseFn",
      "updateCategoryFn",
      "archiveCategoryFn",
      "deleteCategoryFn",
      "removeFamilyMemberFn",
      "changeFamilyMemberRoleFn",
      "transferOwnershipFn",
      "revokeInviteFn",
      "deleteSettlementFn",
      "recordSettlementFn",
      "getMonthlySummaryFn",
      "listActivityFn",
    ];
    for (const name of idEndpoints) {
      if (name === "getMonthlySummaryFn") {
        const result = (await endpoints.get(name)!({
          data: { month: 10, year: 2026, memberId: memberB.id },
        })) as { expenses: unknown[] };
        expect(result.expenses, `${name} returns no foreign-family rows`).toEqual([]);
        continue;
      }
      if (name === "listActivityFn") {
        const result = (await endpoints.get(name)!({
          data: { memberId: memberB.id, limit: 20 },
        })) as { items: unknown[] };
        expect(result.items, `${name} returns no foreign-family rows`).toEqual([]);
        continue;
      }
      let error: unknown;
      try {
        await endpoints.get(name)!({ data: crossFamilyCalls[name] });
      } catch (caught) {
        error = caught;
      }
      expect(statusCode(error), `${name} must hide foreign-family records`).toBe(404);
    }
  });
});
