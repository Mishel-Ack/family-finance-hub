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
import { setAuthResolverForTests, type AuthContext } from "@/lib/authz";
import { setHeadersForTests } from "@/lib/http-utils";
import { MockAiProvider } from "@/lib/ai/provider";
import { resetAiRateLimitForTests, setAiProviderForTests } from "@/services/ai";
import {
  askCoachFn,
  getCoachConversationFn,
  listCoachConversationsFn,
  deleteCoachConversationFn,
} from "@/services/coach";
import { removeFamilyMemberFn } from "@/services/family";

describe("AI Coach integration & isolation", () => {
  const suffix = crypto.randomUUID();
  let familyAId = "";
  let familyBId = "";
  let userAId = "";
  let memberAId = "";
  let viewerAId = "";
  let viewerMemberAId = "";
  let userBId = "";
  let memberBId = "";
  let categoryAId = "";

  beforeAll(async () => {
    process.env["AI_ENABLED"] = "true";
    setHeadersForTests({ origin: "http://familybudget.test", host: "familybudget.test" });

    // Family A
    const ownerA = await prisma.user.create({
      data: { name: "Coach Owner A", email: `ownerA-${suffix}@test.local`, passwordHash: "x" },
    });
    userAId = ownerA.id;
    const familyA = await prisma.family.create({
      data: {
        name: `Family A ${suffix}`,
        ownerId: userAId,
        aiEnabled: true,
        aiMonthlyCapMicros: 5000000,
      },
    });
    familyAId = familyA.id;
    const memA = await prisma.familyMember.create({
      data: { familyId: familyAId, userId: userAId, displayName: "Owner A", role: "OWNER" },
    });
    memberAId = memA.id;

    // Member / Viewer in Family A
    const viewerA = await prisma.user.create({
      data: { name: "Viewer A", email: `viewerA-${suffix}@test.local`, passwordHash: "x" },
    });
    viewerAId = viewerA.id;
    const vMemA = await prisma.familyMember.create({
      data: { familyId: familyAId, userId: viewerAId, displayName: "Viewer A", role: "VIEWER" },
    });
    viewerMemberAId = vMemA.id;

    // Category in Family A
    const cat = await prisma.category.create({
      data: { familyId: familyAId, name: "Groceries" },
    });
    categoryAId = cat.id;

    // Family B
    const ownerB = await prisma.user.create({
      data: { name: "Owner B", email: `ownerB-${suffix}@test.local`, passwordHash: "x" },
    });
    userBId = ownerB.id;
    const familyB = await prisma.family.create({
      data: {
        name: `Family B ${suffix}`,
        ownerId: userBId,
        aiEnabled: true,
        aiMonthlyCapMicros: 5000000,
      },
    });
    familyBId = familyB.id;
    const memB = await prisma.familyMember.create({
      data: { familyId: familyBId, userId: userBId, displayName: "Owner B", role: "OWNER" },
    });
    memberBId = memB.id;
  });

  afterAll(async () => {
    setAiProviderForTests(undefined);
    await resetAiRateLimitForTests();
    setAuthResolverForTests(undefined);
    setHeadersForTests(undefined);

    await prisma.family.deleteMany({
      where: { id: { in: [familyAId, familyBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, viewerAId, userBId] } },
    });
  });

  it("enforces cross-user and cross-family conversation isolation", async () => {
    // Create a conversation for Viewer A
    const conv = await prisma.coachConversation.create({
      data: {
        familyId: familyAId,
        userId: viewerAId,
        title: "Viewer's private chat",
      },
    });

    // 1. Owner A tries to read Viewer A's conversation -> 404
    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    await expect(getCoachConversationFn({ data: conv.id })).rejects.toThrow(
      "Conversation not found",
    );

    // 2. Owner B (different family) tries to read -> 404
    setAuthResolverForTests(async () => ({
      userId: userBId,
      familyId: familyBId,
      memberId: memberBId,
      role: "OWNER",
      user: { id: userBId, name: "Owner B", email: "b@test.local" },
    }));

    await expect(getCoachConversationFn({ data: conv.id })).rejects.toThrow(
      "Conversation not found",
    );

    // 3. Viewer A can read their own conversation
    setAuthResolverForTests(async () => ({
      userId: viewerAId,
      familyId: familyAId,
      memberId: viewerMemberAId,
      role: "VIEWER",
      user: { id: viewerAId, name: "Viewer A", email: "v@test.local" },
    }));

    const result = await getCoachConversationFn({ data: conv.id });
    expect(result.id).toBe(conv.id);
  });

  it("allows VIEWER role to use coach read-only", async () => {
    setAuthResolverForTests(async () => ({
      userId: viewerAId,
      familyId: familyAId,
      memberId: viewerMemberAId,
      role: "VIEWER",
      user: { id: viewerAId, name: "Viewer A", email: "v@test.local" },
    }));

    const list = await listCoachConversationsFn({ data: undefined });
    expect(Array.isArray(list)).toBe(true);
  });

  it("strictly isolates private expenses from coach tools", async () => {
    const now = new Date();
    // Create shared expense
    await prisma.expense.create({
      data: {
        familyId: familyAId,
        userId: userAId,
        memberId: memberAId,
        categoryId: categoryAId,
        amountPaise: 50000, // ₹500
        description: "Shared milk",
        visibility: "SHARED",
        date: now,
      },
    });

    // Create a massive PRIVATE expense
    await prisma.expense.create({
      data: {
        familyId: familyAId,
        userId: viewerAId,
        memberId: viewerMemberAId,
        categoryId: categoryAId,
        amountPaise: 99999999, // ₹9,99,999.99 private
        description: "Private secret",
        visibility: "PRIVATE",
        date: now,
      },
    });

    // Mock AI responding with tool call to get_spending_summary, then answer
    const mockProvider = new MockAiProvider([
      {
        text: JSON.stringify({
          tool_calls: [
            {
              name: "get_spending_summary",
              parameters: { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() },
            },
          ],
        }),
        model: "claude-sonnet-5-5",
        inputTokens: 10,
        outputTokens: 20,
      },
      {
        text: JSON.stringify({
          answer: "Your family spent ₹500 on groceries this month.",
        }),
        model: "claude-sonnet-5-5",
        inputTokens: 20,
        outputTokens: 15,
      },
    ]);
    setAiProviderForTests(mockProvider);
    await resetAiRateLimitForTests();

    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    const response = await askCoachFn({ data: { message: "What did we spend?" } });
    expect(response.reply).toContain("₹500");
    expect(response.reply).not.toContain("9,99,999");
    expect(response.sources).toHaveLength(1);
    expect(response.sources[0]?.summary).toContain("₹500");
  });

  it("regenerates on number mismatch and falls back to code summary if still ungrounded", async () => {
    const now = new Date();
    // 1st call: tool request
    // 2nd call: hallucinated answer with ungrounded ₹88,888
    // 3rd call (retry): hallucinated answer again with ungrounded ₹77,777
    const mockProvider = new MockAiProvider([
      {
        text: JSON.stringify({
          tool_calls: [
            {
              name: "get_spending_summary",
              parameters: { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() },
            },
          ],
        }),
        model: "claude-sonnet-5-5",
        inputTokens: 10,
        outputTokens: 20,
      },
      {
        text: JSON.stringify({
          answer: "You spent ₹88,888 on vacations.",
        }),
        model: "claude-sonnet-5-5",
        inputTokens: 20,
        outputTokens: 15,
      },
      {
        text: JSON.stringify({
          answer: "You spent ₹77,777 on luxury cars.",
        }),
        model: "claude-sonnet-5-5",
        inputTokens: 20,
        outputTokens: 15,
      },
    ]);
    setAiProviderForTests(mockProvider);
    await resetAiRateLimitForTests();

    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    const response = await askCoachFn({ data: { message: "How much did we spend?" } });
    // Should fall back to the deterministic code-built summary
    expect(response.reply).toContain("Based on your family's verified financial records");
    expect(response.reply).toContain("₹500");
  });

  it("surfaces provider failures without saving a success-shaped assistant reply", async () => {
    setAiProviderForTests({
      async complete() {
        throw new Error("provider failure with private details");
      },
    });
    await resetAiRateLimitForTests();
    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    await expect(askCoachFn({ data: { message: "Check my budget" } })).rejects.toMatchObject({
      statusCode: 503,
      message: "AI Coach is temporarily unavailable. Please try again later.",
    });
    const conversation = await prisma.coachConversation.findFirstOrThrow({
      where: { familyId: familyAId, userId: userAId, title: "Check my budget" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(conversation.messages.map((message) => message.role)).toEqual(["USER"]);
    expect(JSON.stringify(conversation.messages)).not.toContain("private details");
  });

  it("does not silently ignore failed coach data tools", async () => {
    setAiProviderForTests(
      new MockAiProvider([
        {
          text: JSON.stringify({
            tool_calls: [{ name: "unknown_tool", parameters: {} }],
          }),
          model: "claude-sonnet-5-5",
          inputTokens: 10,
          outputTokens: 20,
        },
      ]),
    );
    await resetAiRateLimitForTests();
    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    await expect(askCoachFn({ data: { message: "Check my budget" } })).rejects.toMatchObject({
      statusCode: 502,
      message: "AI Coach could not retrieve verified household information. Please try again.",
    });
  });

  it("deletes user coach conversations when a member is removed", async () => {
    // Create conversation for Viewer A
    const conv = await prisma.coachConversation.create({
      data: {
        familyId: familyAId,
        userId: viewerAId,
        title: "To be deleted on remove",
      },
    });

    setAuthResolverForTests(async () => ({
      userId: userAId,
      familyId: familyAId,
      memberId: memberAId,
      role: "OWNER",
      user: { id: userAId, name: "Owner A", email: "a@test.local" },
    }));

    // Remove Viewer A
    await removeFamilyMemberFn({ data: viewerMemberAId });

    // Verify conversation was deleted
    const found = await prisma.coachConversation.findUnique({ where: { id: conv.id } });
    expect(found).toBeNull();
  });
});
