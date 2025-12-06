/**
 * Redis Cache Utility (PRD Phase 8)
 * Caching and rate limiting using Upstash Redis
 */

import { Redis } from "@upstash/redis";

// Initialize Redis client
// Only create client if valid URLs are provided (not dummy values)
const isValidRedisUrl = (url?: string) =>
  url && url.startsWith('https://') && !url.includes('your-');

export const redis =
  isValidRedisUrl(process.env.UPSTASH_REDIS_REST_URL) &&
  process.env.UPSTASH_REDIS_REST_TOKEN &&
  !process.env.UPSTASH_REDIS_REST_TOKEN.includes('your-')
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/**
 * Cache wrapper with TTL
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300 // 5 minutes default
): Promise<T> {
  if (!redis) {
    // If Redis not configured, bypass cache
    return fetcher();
  }

  try {
    // Try to get from cache
    const cached = await redis.get<T>(key);
    if (cached !== null) {
      console.log(`[Cache] HIT: ${key}`);
      return cached;
    }

    console.log(`[Cache] MISS: ${key}`);

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    await redis.setex(key, ttl, JSON.stringify(data));

    return data;
  } catch (error) {
    console.error("[Cache] Error:", error);
    // Fallback to fetcher on cache error
    return fetcher();
  }
}

/**
 * Invalidate cache by key pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Cache] Invalidated ${keys.length} keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error("[Cache] Invalidation error:", error);
  }
}

/**
 * Rate limiting using sliding window
 */
export async function rateLimit(
  identifier: string,
  limit: number = 10,
  window: number = 60 // 1 minute
): Promise<{ success: boolean; remaining: number; reset: number }> {
  if (!redis) {
    // If Redis not configured, allow all requests
    return { success: true, remaining: limit, reset: Date.now() + window * 1000 };
  }

  try {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - window * 1000;

    // Remove old entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const count = await redis.zcard(key);

    if (count >= limit) {
      const oldestEntry = await redis.zrange(key, 0, 0, { withScores: true });
      const reset = oldestEntry[1] ? Number(oldestEntry[1]) + window * 1000 : now + window * 1000;

      return {
        success: false,
        remaining: 0,
        reset,
      };
    }

    // Add current request
    await redis.zadd(key, { score: now, member: `${now}:${Math.random()}` });
    await redis.expire(key, window);

    return {
      success: true,
      remaining: limit - count - 1,
      reset: now + window * 1000,
    };
  } catch (error) {
    console.error("[RateLimit] Error:", error);
    // On error, allow request
    return { success: true, remaining: limit, reset: Date.now() + window * 1000 };
  }
}

/**
 * Cache key builders
 */
export const cacheKeys = {
  // Projects
  projectList: () => "projects:list",
  projectDetail: (id: string) => `projects:detail:${id}`,
  projectSearch: (query: string) => `projects:search:${query}`,

  // Companies
  companyDetail: (id: string) => `companies:detail:${id}`,
  companyList: (userId: string) => `companies:list:${userId}`,

  // Matching
  matchingResults: (companyId: string) => `matching:results:${companyId}`,
  matchingPreferences: (userId: string, companyId: string) =>
    `matching:preferences:${userId}:${companyId}`,

  // Business Plans
  businessPlanDetail: (id: string) => `business-plans:detail:${id}`,
  businessPlanList: (userId: string) => `business-plans:list:${userId}`,

  // Evaluations
  evaluationDetail: (id: string) => `evaluations:detail:${id}`,
  evaluationList: (userId: string) => `evaluations:list:${userId}`,
} as const;

/**
 * Cache TTL constants (in seconds)
 */
export const cacheTTL = {
  short: 60, // 1 minute
  medium: 300, // 5 minutes
  long: 1800, // 30 minutes
  day: 86400, // 24 hours
} as const;
