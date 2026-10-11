import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/authz";
import { resetAiRateLimitForTests, runAiCompletion, setAiProviderForTests } from "@/services/ai";
import { MockAiProvider } from "@/lib/ai/provider";

describe("AI infrastructure guards", () => {
  const suffix = crypto.randomUUID();
  let auth: AuthContext;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "AI test", email: `ai-${suffix}@example.test`, passwordHash: "unused" },
    });
    const family = await prisma.family.create({
      data: {
        name: `AI test ${suffix}`,
        ownerId: user.id,
        aiEnabled: true,
        aiMonthlyCapMicros: 50,
      },
    });
    const member = await prisma.familyMember.create({
      data: { familyId: family.id, userId: user.id, displayName: "AI test", role: "OWNER" },
    });
    auth = {
      userId: user.id,
      familyId: family.id,
      memberId: member.id,
      role: "OWNER",
      user: { id: user.id, name: user.name, email: user.email },
    };
    process.env["AI_ENABLED"] = "true";
  });

  afterAll(async () => {
    setAiProviderForTests(undefined);
    resetAiRateLimitForTests();
    if (auth) await prisma.family.deleteMany({ where: { id: auth.familyId } });
    await prisma.user.deleteMany({ where: { email: `ai-${suffix}@example.test` } });
  });

  beforeAll(() => resetAiRateLimitForTests());

  it("blocks families that have not enabled AI and rejects viewers", async () => {
    await prisma.family.update({ where: { id: auth.familyId }, data: { aiEnabled: false } });
    await expect(
      runAiCompletion({
        auth,
        feature: "EXPENSE_TEXT",
        input: { model: "mock", prompt: "private prompt", maxTokens: 100 },
      }),
    ).rejects.toThrow("AI has not been enabled");
    await prisma.family.update({ where: { id: auth.familyId }, data: { aiEnabled: true } });
    await expect(
      runAiCompletion({
        auth: { ...auth, role: "VIEWER" },
        feature: "EXPENSE_TEXT",
        input: { model: "mock", prompt: "private prompt", maxTokens: 100 },
      }),
    ).rejects.toThrow("permission");
  });

  it("enforces the family cost cap before calling the provider", async () => {
    const provider = new MockAiProvider([
      { text: "ok", model: "claude-haiku-4-5-20251001", inputTokens: 0, outputTokens: 0 },
    ]);
    setAiProviderForTests(provider);
    await prisma.family.update({ where: { id: auth.familyId }, data: { aiMonthlyCapMicros: 0 } });
    await expect(
      runAiCompletion({
        auth,
        feature: "EXPENSE_TEXT",
        input: { model: "mock", prompt: "do not log this", maxTokens: 100 },
      }),
    ).rejects.toThrow("monthly AI allowance");
    expect(provider.requests).toHaveLength(0);
    await prisma.family.update({ where: { id: auth.familyId }, data: { aiMonthlyCapMicros: 50 } });
  });

  it("records metadata for a successful call without logging prompt content", async () => {
    const log = vi.spyOn(console, "log");
    const provider = new MockAiProvider([
      {
        text: '{"draft":true}',
        model: "claude-haiku-4-5-20251001",
        inputTokens: 3,
        outputTokens: 4,
      },
    ]);
    setAiProviderForTests(provider);
    resetAiRateLimitForTests();
    await runAiCompletion({
      auth,
      feature: "EXPENSE_TEXT",
      input: { model: "mock", prompt: "sensitive prompt value", maxTokens: 100 },
    });
    const usage = await prisma.aiUsage.findFirst({
      where: { familyId: auth.familyId, feature: "EXPENSE_TEXT" },
    });
    expect(usage).toMatchObject({ inputTokens: 3, outputTokens: 4, outcome: "OK" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("sensitive prompt value");
    log.mockRestore();
  });

  it("limits a user to 20 calls in ten minutes", async () => {
    const provider = new MockAiProvider(
      Array.from({ length: 21 }, () => ({
        text: "ok",
        model: "claude-haiku-4-5-20251001",
        inputTokens: 0,
        outputTokens: 0,
      })),
    );
    setAiProviderForTests(provider);
    await prisma.aiUsage.deleteMany({ where: { familyId: auth.familyId } });
    await prisma.family.update({ where: { id: auth.familyId }, data: { aiMonthlyCapMicros: 500 } });
    resetAiRateLimitForTests();
    for (let i = 0; i < 20; i++) {
      await runAiCompletion({
        auth,
        feature: "EXPENSE_TEXT",
        input: { model: "mock", prompt: "ok", maxTokens: 10 },
      });
    }
    await expect(
      runAiCompletion({
        auth,
        feature: "EXPENSE_TEXT",
        input: { model: "mock", prompt: "ok", maxTokens: 10 },
      }),
    ).rejects.toThrow("request limit");
    expect(provider.requests).toHaveLength(20);
  });
});
