/**
 * Rate Limiter — Protects Free-Tier LLM Budgets
 * ═══════════════════════════════════════════════
 *
 * WHY RATE LIMIT?
 * ───────────────
 * Free LLM APIs have daily/minute limits. Without rate limiting,
 * a single user refreshing the page 50 times could exhaust the
 * entire free tier for ALL users.
 *
 * WHAT WE LIMIT:
 * ──────────────
 * - AI meal parsing: 15 requests per user per day
 * - Weekly insights: 1 request per user per week
 * - Auth routes: NOT limited here (handled by Supabase's built-in rate limiting)
 *
 * GRACEFUL DEGRADATION:
 * ─────────────────────
 * If Upstash Redis is not configured (empty URL/token), the rate limiter
 * returns { limited: false } — effectively disabled. This means:
 * - Development works without Redis
 * - Only production needs Upstash configured
 *
 * USES: @upstash/ratelimit + @upstash/redis (already in package.json)
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Whether Upstash is configured. If not, rate limiting is disabled. */
const isConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

/**
 * Create a Redis client.
 * Only created if environment variables are set.
 */
function getRedis(): Redis | null {
  if (!isConfigured) return null;

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

/**
 * AI Meal Parsing Rate Limiter
 * ────────────────────────────
 * 15 requests per user per 24-hour sliding window.
 *
 * WHY 15?
 * Most users log 3-4 meals per day. 15 allows for:
 * - 4 meals/day × 3 = 12 requests (normal use)
 * - 3 extra for retries or corrections
 */
const mealParserLimiter = (() => {
  const redis = getRedis();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(15, "1 d"),
    prefix: "fitlog:ai:meal",
    // prefix ensures this limiter's keys don't collide with others
  });
})();

/**
 * Weekly Insight Rate Limiter
 * ───────────────────────────
 * 1 request per user per 7-day sliding window.
 * The insight is cached in the database anyway, but this prevents
 * spamming the LLM with regeneration requests.
 */
const insightLimiter = (() => {
  const redis = getRedis();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(2, "7 d"),
    // 2 instead of 1: allows one regeneration if the first result was bad
    prefix: "fitlog:ai:insight",
  });
})();

export interface RateLimitResult {
  limited: boolean;
  remaining?: number;
  resetAt?: Date;
}

/**
 * Check if a user has exceeded their AI meal parsing rate limit.
 *
 * @returns { limited: false } if Redis is not configured (development mode)
 */
export async function checkMealParserLimit(
  userId: string
): Promise<RateLimitResult> {
  if (!mealParserLimiter) {
    return { limited: false };
  }

  const result = await mealParserLimiter.limit(userId);

  return {
    limited: !result.success,
    remaining: result.remaining,
    resetAt: new Date(result.reset),
  };
}

/**
 * Check if a user has exceeded their weekly insight rate limit.
 */
export async function checkInsightLimit(
  userId: string
): Promise<RateLimitResult> {
  if (!insightLimiter) {
    return { limited: false };
  }

  const result = await insightLimiter.limit(userId);

  return {
    limited: !result.success,
    remaining: result.remaining,
    resetAt: new Date(result.reset),
  };
}
