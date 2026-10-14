#!/usr/bin/env node
/**
 * ai:smoke — Makes one tiny real Claude API call if ANTHROPIC_API_KEY is set.
 * Prints "skipped" and exits 0 when no key is configured.
 * Never prints the key or full model responses.
 */

const key = process.env["ANTHROPIC_API_KEY"];

if (!key) {
  console.log("ai:smoke: ANTHROPIC_API_KEY not set — skipped");
  process.exit(0);
}

const model = process.env["AI_MODEL_FAST"] ?? "claude-haiku-4-5-20251001";

async function smokeTest() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        temperature: 0,
        messages: [{ role: "user", content: "Reply with the single word: OK" }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(`ai:smoke: API returned status ${response.status}`);
      process.exit(1);
    }
    const payload = await response.json();
    const text = (payload?.content ?? [])
      .flatMap((block) => (typeof block?.text === "string" ? [block.text] : []))
      .join("")
      .trim();
    const inputTokens = payload?.usage?.input_tokens ?? "?";
    const outputTokens = payload?.usage?.output_tokens ?? "?";
    // Only log metadata — never the full response or any secrets.
    console.log(
      `ai:smoke: OK — model=${payload?.model ?? model} in=${inputTokens} out=${outputTokens} reply_len=${text.length}`,
    );
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error(
      `ai:smoke: request failed — ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exit(1);
  }
}

smokeTest();
