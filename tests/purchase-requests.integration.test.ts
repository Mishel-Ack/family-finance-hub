import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: <T>(fn: T): T => fn,
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
import { decidePurchaseRequestFn } from "@/services/purchase-requests";

describe("purchase request transitions", () => {
  const suffix = crypto.randomUUID();
  let familyId = "";
  let requestId = "";
  let ownerId = "";
  let memberId = "";
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { name: "Approver", email: `approval-${suffix}@example.test`, passwordHash: "unused" },
    });
    ownerId = owner.id;
    const family = await prisma.family.create({ data: { name: `Approval ${suffix}`, ownerId } });
    familyId = family.id;
    const [ownerMember, requester] = await Promise.all([
      prisma.familyMember.create({
        data: { familyId, userId: ownerId, displayName: "Owner", role: "OWNER" },
      }),
      prisma.familyMember.create({ data: { familyId, displayName: "Requester", role: "MEMBER" } }),
    ]);
    memberId = requester.id;
    const category = await prisma.category.create({ data: { familyId, name: "Household" } });
    const request = await prisma.purchaseRequest.create({
      data: {
        familyId,
        requesterMemberId: memberId,
        title: "Vacuum",
        amountPaise: 200000,
        categoryId: category.id,
        impactSnapshot: { privateExpensesIncluded: false },
      },
    });
    requestId = request.id;
    setAuthResolverForTests(async () => ({
      userId: ownerId,
      familyId,
      memberId: ownerMember.id,
      role: "OWNER",
      user: { id: owner.id, name: owner.name, email: owner.email },
    }));
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });
  });

  it("allows only one concurrent decision for a pending request", async () => {
    const outcomes = await Promise.allSettled([
      decidePurchaseRequestFn({ data: { id: requestId, status: "APPROVED", decisionNote: "" } }),
      decidePurchaseRequestFn({ data: { id: requestId, status: "REJECTED", decisionNote: "" } }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const stored = await prisma.purchaseRequest.findFirst({ where: { id: requestId, familyId } });
    expect(["APPROVED", "REJECTED"]).toContain(stored?.status);
    expect(stored?.decidedByMemberId).not.toBeNull();
  });

  afterAll(async () => {
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);
    if (familyId) await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.user.deleteMany({ where: { email: `approval-${suffix}@example.test` } });
  });
});
