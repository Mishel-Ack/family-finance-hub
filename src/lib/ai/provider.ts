import { z } from "zod";

export type AiFeature =
  | "CATEGORIZATION"
  | "EXPENSE_TEXT"
  | "RECEIPT"
  | "BANK_MESSAGES"
  | "COACH"
  | "SCENARIO_EXPLANATION"
  | "REPORT_NARRATIVE";

export interface AiCompletionInput {
  model: string;
  prompt: string;
  feature: AiFeature;
  maxTokens: number;
  temperature?: 0;
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
}

export interface AiCompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  complete(input: AiCompletionInput): Promise<AiCompletion>;
}

const MAX_TOKENS: Record<AiFeature, number> = {
  CATEGORIZATION: 256,
  EXPENSE_TEXT: 1200,
  RECEIPT: 1600,
  BANK_MESSAGES: 1200,
  COACH: 1800,
  SCENARIO_EXPLANATION: 600,
  REPORT_NARRATIVE: 1200,
};

const anthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  model: z.string(),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
});

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export class ClaudeProvider implements AiProvider {
  constructor(private readonly apiKey = process.env["ANTHROPIC_API_KEY"]) {}

  async complete(input: AiCompletionInput): Promise<AiCompletion> {
    if (!this.apiKey) throw new Error("AI provider is not configured");
    if (!Number.isInteger(input.maxTokens) || input.maxTokens < 1) {
      throw new Error("Invalid AI token limit");
    }
    const maxTokens = Math.min(input.maxTokens, MAX_TOKENS[input.feature]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: input.model,
            max_tokens: maxTokens,
            ...(input.temperature === 0 ? { temperature: 0 } : {}),
            messages: [
              {
                role: "user",
                content: input.image
                  ? [
                      {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: input.image.mediaType,
                          data: input.image.base64,
                        },
                      },
                      { type: "text", text: input.prompt },
                    ]
                  : input.prompt,
              },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (attempt === 0 && retryable(response.status)) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            continue;
          }
          throw new Error(`AI provider returned status ${response.status}`);
        }
        const payload: unknown = await response.json();
        const parsed = anthropicResponseSchema.parse(payload);
        return {
          text: parsed.content.flatMap((block) => (block.text ? [block.text] : [])).join("\n"),
          model: parsed.model,
          inputTokens: parsed.usage.input_tokens,
          outputTokens: parsed.usage.output_tokens,
        };
      } catch (error: unknown) {
        if (attempt === 0 && error instanceof TypeError) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error("AI provider request failed");
  }
}

export class MockAiProvider implements AiProvider {
  readonly requests: AiCompletionInput[] = [];

  constructor(private readonly responses: AiCompletion[] = []) {}

  async complete(input: AiCompletionInput): Promise<AiCompletion> {
    this.requests.push(input);
    const response = this.responses.shift();
    if (!response) throw new Error("No mock AI response configured");
    return response;
  }
}

export async function completeValidated<T>(options: {
  provider: AiProvider;
  input: AiCompletionInput;
  schema: z.ZodType<T>;
}): Promise<{ value: T; completion: AiCompletion }> {
  let lastCompletion: AiCompletion | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await options.provider.complete({
      ...options.input,
      prompt:
        attempt === 0
          ? options.input.prompt
          : `${options.input.prompt}\nYour previous output did not match the required schema. Return valid JSON only.`,
    });
    lastCompletion = completion;
    try {
      const json = JSON.parse(completion.text) as unknown;
      return { value: options.schema.parse(json), completion };
    } catch {
      // Model output is untrusted; retry once, then let the caller fail gracefully.
    }
  }
  throw Object.assign(new Error("AI returned an invalid response"), {
    completion: lastCompletion,
  });
}

export function modelFor(feature: AiFeature): string {
  if (feature === "CATEGORIZATION" || feature === "EXPENSE_TEXT" || feature === "BANK_MESSAGES") {
    return process.env["AI_MODEL_FAST"] ?? "claude-haiku-4-5-20251001";
  }
  if (feature === "RECEIPT") return process.env["AI_MODEL_VISION"] ?? "claude-sonnet-5-5";
  return process.env["AI_MODEL_COACH"] ?? "claude-sonnet-5-5";
}
