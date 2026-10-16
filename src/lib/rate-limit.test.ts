import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRateLimitsForTests,
  consumeRateLimit,
  setRateLimitClockForTests,
} from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

describe("PostgreSQL request rate limit", () => {
  let now = new Date("2026-10-15T12:00:00.000Z");

  beforeEach(async () => {
    await clearRateLimitsForTests();
    setRateLimitClockForTests(() => new Date(now));
  });

  afterEach(async () => {
    await clearRateLimitsForTests();
    setRateLimitClockForTests(undefined);
  });

  it("rejects requests after the configured limit", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await consumeRateLimit(key, 2, 60_000);
    await consumeRateLimit(key, 2, 60_000);
    await expect(consumeRateLimit(key, 2, 60_000)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("starts a new window at the injected clock boundary", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await consumeRateLimit(key, 1, 60_000);
    now = new Date(now.getTime() + 60_000);
    await expect(consumeRateLimit(key, 1, 60_000)).resolves.toBe(1);
  });

  it("atomically enforces the limit under concurrent requests", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => consumeRateLimit(key, 3, 60_000)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
  });

  it("cleans old buckets periodically", async () => {
    await consumeRateLimit(`test:old:${crypto.randomUUID()}`, 1, 60_000);
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    for (let index = 0; index < 256; index++) {
      await consumeRateLimit(`test:new:${index}:${crypto.randomUUID()}`, 1, 60_000);
    }
    expect(
      await prisma.rateLimitBucket.count({
        where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      }),
    ).toBe(0);
  });
});
