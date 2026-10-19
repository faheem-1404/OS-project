import "server-only";

/**
 * Small in-process rate limiter for the two expensive, abuse-prone
 * entry points: joining a room and casting a vote.
 *
 * This is a courtesy throttle to blunt scripted traffic, not a security
 * boundary — the real guarantees are server-side validation, the
 * UNIQUE (round_id, player_id) constraint and idempotent vote handling.
 * With Supabase configured, put a real limiter in front of the deployment
 * (Vercel WAF / Supabase rate limits) since serverless instances are not
 * shared between requests.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __campuslock_limits?: Map<string, Bucket> };
const buckets = (g.__campuslock_limits ??= new Map<string, Bucket>());

export interface Limit {
  max: number;
  windowMs: number;
}

export const JOIN_LIMIT: Limit = { max: 500, windowMs: 60_000 };
export const VOTE_LIMIT: Limit = { max: 1000, windowMs: 10_000 };

export function clientKey(headers: Headers, fallback = "anon"): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    fallback
  );
}

export function rateLimit(key: string, limit: Limit): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  if (bucket.count >= limit.max) return false;
  bucket.count += 1;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return true;
}