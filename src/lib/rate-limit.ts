import { httpError } from "@/lib/http-error";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function enforceRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= maxRequests) {
    throw httpError("Too many requests. Please try again later.", 429);
  }
  bucket.count++;
}
