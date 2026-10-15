import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertCan, requireMember } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/http-utils";
import { httpError, notFound } from "@/lib/http-error";
import {
  ClaudeProvider,
  type AiCompletionInput,
  type AiFeature,
  type AiProvider,
} from "@/lib/ai/provider";
import { clearRateLimitsForTests, consumeRateLimit } from "@/lib/rate-limit";

let providerOverride: AiProvider | undefined;

export function setAiProviderForTests(provider: AiProvider | undefined) {
  if (process.env["NODE_ENV"] !== "test")
    throw new Error("AI test seam only available in test mode");
  providerOverride = provider;
}

export function resetAiRateLimitForTests() {
  return clearRateLimitsForTests("ai");
}

function aiRateLimitSetting(
  name: "AI_RATE_LIMIT_CALLS" | "AI_RATE_LIMIT_WINDOW_MS",
  fallback: number,
) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function estimateCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const fast = model.includes("haiku");
  const inputRateMicrosPerToken = fast ? 1 : 3;
  const outputRateMicrosPerToken = fast ? 5 : 15;
  return Math.ceil(inputTokens * inputRateMicrosPerToken + outputTokens * outputRateMicrosPerToken);
}

export async function runAiCompletion<T extends AiFeature>(options: {
  auth: Awaited<ReturnType<typeof requireMember>>;
  feature: T;
  input: Omit<AiCompletionInput, "feature">;
}) {
  const { auth, feature } = options;
  assertCan(auth.role, "ai:use");
  if (process.env["AI_ENABLED"] === "false") throw httpError("AI features are disabled", 503);
  const family = await prisma.family.findFirst({
    where: { id: auth.familyId },
    select: { aiEnabled: true, aiMonthlyCapMicros: true },
  });
  if (!family) throw notFound("Family not found");
  if (!family.aiEnabled) throw httpError("AI has not been enabled for this family", 403);
  await consumeRateLimit(
    `ai:${auth.userId}`,
    aiRateLimitSetting("AI_RATE_LIMIT_CALLS", 20),
    aiRateLimitSetting("AI_RATE_LIMIT_WINDOW_MS", 10 * 60_000),
    "AI request limit reached. Try again later.",
  );
  const start = Date.now();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const usage = await prisma.aiUsage.aggregate({
    where: { familyId: auth.familyId, createdAt: { gte: monthStart } },
    _sum: { estimatedCostMicros: true },
  });
  if ((usage._sum.estimatedCostMicros ?? 0) >= family.aiMonthlyCapMicros) {
    throw httpError("This family's monthly AI allowance has been reached", 429);
  }

  let completion: Awaited<ReturnType<AiProvider["complete"]>> | undefined;
  let outcome: "OK" | "INVALID_OUTPUT" | "ERROR" = "ERROR";
  try {
    completion = await (providerOverride ?? new ClaudeProvider()).complete({
      ...options.input,
      feature,
    });
    outcome = "OK";
    return completion;
  } catch (error: unknown) {
    outcome =
      error instanceof Error && error.message.includes("invalid response")
        ? "INVALID_OUTPUT"
        : "ERROR";
    throw error;
  } finally {
    if (completion) {
      const estimatedCostMicros = estimateCostMicros(
        completion.model,
        completion.inputTokens,
        completion.outputTokens,
      );
      await prisma.aiUsage.create({
        data: {
          familyId: auth.familyId,
          userId: auth.userId,
          feature,
          model: completion.model,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          estimatedCostMicros,
          latencyMs: Date.now() - start,
          outcome,
        },
      });
    }
  }
}

const aiSettingSchema = z.object({ enabled: z.boolean() });

export const getAiAvailabilityFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("readAll");
    const [family, usage] = await Promise.all([
      prisma.family.findFirst({
        where: { id: auth.familyId },
        select: { aiEnabled: true, aiMonthlyCapMicros: true },
      }),
      prisma.aiUsage.aggregate({
        where: {
          familyId: auth.familyId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { estimatedCostMicros: true },
      }),
    ]);
    if (!family) throw notFound("Family not found");
    const usedMicros = usage._sum.estimatedCostMicros ?? 0;
    const enabled = process.env["AI_ENABLED"] !== "false" && family.aiEnabled;
    return {
      enabled,
      capped: usedMicros >= family.aiMonthlyCapMicros,
      usedMicros,
      capMicros: family.aiMonthlyCapMicros,
    };
  });

export const getAiSettingsFn = createServerFn({ method: "GET" })
  .validator(z.undefined().optional())
  .handler(async () => {
    const auth = await requireMember("ai:manage");
    const [family, usage] = await Promise.all([
      prisma.family.findFirst({
        where: { id: auth.familyId },
        select: { aiEnabled: true, aiMonthlyCapMicros: true },
      }),
      prisma.aiUsage.aggregate({
        where: {
          familyId: auth.familyId,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { estimatedCostMicros: true },
      }),
    ]);
    if (!family) throw notFound("Family not found");
    return {
      enabled: family.aiEnabled,
      capMicros: family.aiMonthlyCapMicros,
      usedMicros: usage._sum.estimatedCostMicros ?? 0,
    };
  });

export const setAiEnabledFn = createServerFn({ method: "POST" })
  .validator(aiSettingSchema)
  .handler(async ({ data }) => {
    assertSameOrigin();
    const auth = await requireMember("ai:manage");
    await prisma.family.updateMany({
      where: { id: auth.familyId },
      data: { aiEnabled: data.enabled },
    });
    return { enabled: data.enabled };
  });

export function getAiSettings() {
  return getAiSettingsFn({ data: undefined });
}

export function getAiAvailability() {
  return getAiAvailabilityFn({ data: undefined });
}

export function setAiEnabled(enabled: boolean) {
  return setAiEnabledFn({ data: { enabled } });
}
