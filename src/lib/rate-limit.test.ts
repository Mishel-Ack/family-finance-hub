import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "@/lib/rate-limit";

describe("request rate limit", () => {
  it("rejects requests after the configured limit", () => {
    const key = crypto.randomUUID();
    enforceRateLimit(key, 2, 60_000);
    enforceRateLimit(key, 2, 60_000);
    expect(() => enforceRateLimit(key, 2, 60_000)).toThrow(
      expect.objectContaining({ statusCode: 429 }),
    );
  });
});
