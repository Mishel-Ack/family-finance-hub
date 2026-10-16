import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http-error";

let clock = () => new Date();
let requestsSinceCleanup = 0;

function validateLimits(maxRequests: number, windowMs: number) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError("Rate limit must allow at least one request.");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError("Rate-limit window must be a positive number of milliseconds.");
  }
}

function storageKey(key: string) {
  const namespace = key.split(":", 1)[0] || "general";
  const digest = createHash("sha256").update(key).digest("hex");
  return `${namespace}:${digest}`;
}

async function cleanupExpiredBuckets(now: Date) {
  requestsSinceCleanup++;
  if (requestsSinceCleanup < 256) return;
  requestsSinceCleanup = 0;
  await prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
}

export async function consumeRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  message = "Too many requests. Please try again later.",
) {
  validateLimits(maxRequests, windowMs);
  const now = clock();
  const resetAt = new Date(now.getTime() + windowMs);
  const bucketKey = storageKey(key);
  const updated = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${bucketKey}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE
    SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = ${now}
    WHERE "RateLimitBucket"."resetAt" <= ${now}
      OR "RateLimitBucket"."count" < ${maxRequests}
    RETURNING "count"
  `;
  await cleanupExpiredBuckets(now);
  if (updated.length === 0) throw httpError(message, 429);
  return updated[0]!.count;
}

export async function assertRateLimitAvailable(
  key: string,
  maxRequests: number,
  windowMs: number,
  message = "Too many requests. Please try again later.",
) {
  validateLimits(maxRequests, windowMs);
  const bucket = await prisma.rateLimitBucket.findUnique({
    where: { key: storageKey(key) },
    select: { count: true, resetAt: true },
  });
  if (bucket && bucket.resetAt > clock() && bucket.count >= maxRequests) {
    throw httpError(message, 429);
  }
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key: storageKey(key) } });
}

export async function clearRateLimitsForTests(namespace?: string) {
  if (process.env["NODE_ENV"] !== "test") {
    throw new Error("Rate limit test seam only available in test mode");
  }
  if (namespace) {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: `${namespace}:` } } });
  } else {
    await prisma.rateLimitBucket.deleteMany();
  }
  requestsSinceCleanup = 0;
}

export function setRateLimitClockForTests(nextClock?: (() => Date) | undefined) {
  if (process.env["NODE_ENV"] !== "test") {
    throw new Error("Rate limit test seam only available in test mode");
  }
  clock = nextClock ?? (() => new Date());
}
