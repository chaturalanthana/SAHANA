type Bucket = { resetAt: number; count: number };

const buckets = new Map<string, Bucket>();

export function resetRateLimits(): void {
  buckets.clear();
}

/** Returns false when the caller is over the limit. */
export function consumeLoginAttempt(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { resetAt: now + windowMs, count: 1 });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
