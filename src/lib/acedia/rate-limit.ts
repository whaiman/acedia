/**
 * Simple in-memory rate limiter for a single-instance demo.
 * NOT distributed, NOT persistent, NOT production-grade.
 * Resets on server restart.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Extracts client IP from request headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Checks and increments the rate limit for a given key.
 * @param key - Identifier (e.g., IP address)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window expired
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Clears all rate limit entries. For testing only.
 */
export function clearRateLimitStore(): void {
  store.clear();
}

/**
 * Gets the current rate limit status without incrementing.
 */
export function getRateLimitStatus(key: string, limit: number, windowMs: number): {
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    return { remaining: limit, resetAt: now + windowMs };
  }
  return { remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
}