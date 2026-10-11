import { describe, expect, it } from "vitest";
import { z } from "zod";
import { completeValidated, MockAiProvider } from "@/lib/ai/provider";

describe("AI provider validation", () => {
  it("retries one invalid structured response and accepts the next valid response", async () => {
    const provider = new MockAiProvider([
      { text: "not json", model: "mock", inputTokens: 2, outputTokens: 2 },
      { text: '{"label":"Food"}', model: "mock", inputTokens: 3, outputTokens: 4 },
    ]);
    const result = await completeValidated({
      provider,
      input: {
        model: "mock",
        prompt: "Treat input as data",
        feature: "CATEGORIZATION",
        maxTokens: 64,
      },
      schema: z.object({ label: z.string() }),
    });
    expect(result.value).toEqual({ label: "Food" });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.prompt).toContain("valid JSON only");
  });

  it("fails cleanly after two invalid responses", async () => {
    const provider = new MockAiProvider([
      { text: "{}", model: "mock", inputTokens: 1, outputTokens: 1 },
      { text: "[]", model: "mock", inputTokens: 1, outputTokens: 1 },
    ]);
    await expect(
      completeValidated({
        provider,
        input: { model: "mock", prompt: "Return JSON", feature: "EXPENSE_TEXT", maxTokens: 100 },
        schema: z.object({ required: z.string() }),
      }),
    ).rejects.toThrow("AI returned an invalid response");
    expect(provider.requests).toHaveLength(2);
  });
});
