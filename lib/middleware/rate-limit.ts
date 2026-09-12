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

// FAIL-OPEN is a deliberate choice: a fitness app should degrade, not die,
// when Redis blips (a bank would fail closed). But prod running with the
// limiter silently OFF must be loud — it means the LLM budget is unguarded.
if (!isConfigured && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] Upstash Redis is NOT configured — rate limiting is " +
      "DISABLED in production. AI endpoints are unmetered."
  );
}

/**
 * Create a Redis client.
 * Only created if environment variables are set.
 */
function getRedis(): Redis | null {
  if (!isConfigured) return null;

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    // The client's default retry schedule spent ~4.5s failing against a host
    // that no longer resolves — nearly half the ~10s function budget, before
    // the AI call even started. One quick retry covers a genuine blip; a dead
    // Redis should be noticed fast and bypassed (see runLimit below).
    retry: { retries: 1, backoff: () => 100 },
  });
}

/** How long a rate-limit check may take before we stop waiting for it. */
const LIMIT_CHECK_TIMEOUT_MS = 1500;

/**
 * Run a limiter, FAILING OPEN when Redis is unreachable.
 *
 * The header of this file has always said fail-open is the deliberate choice —
 * "a fitness app should degrade, not die, when Redis blips". It was only
 * implemented for the NOT-CONFIGURED case. A configured Redis that could not be
 * reached threw straight out of `limiter.limit()`, so every AI route answered
 * 500 and the user saw "Something went wrong" for a problem in a metering
 * service they never interact with.
 *
 * That is what happened when the Upstash database was deleted: DNS for its
 * hostname returned NXDOMAIN, and meal parsing, workout parsing and weekly
 * insights all went down together — although all three AI providers were up.
 *
 * Now an unreachable or slow Redis lets the request through and logs loudly.
 * The cost is that the AI budget is unmetered while Redis is down; the warning
 * is how that gets noticed, exactly as for the not-configured case above.
 */
async function runLimit(
  limiter: Ratelimit,
  userId: string,
  name: string
): Promise<RateLimitResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      limiter.limit(userId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${LIMIT_CHECK_TIMEOUT_MS}ms`)),
          LIMIT_CHECK_TIMEOUT_MS
        );
      }),
    ]);

    return {
      limited: !result.success,
      remaining: result.remaining,
      resetAt: new Date(result.reset),
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? `${error.message}${error.cause ? ` (${String((error.cause as { code?: string }).code ?? error.cause)})` : ""}`
        : String(error);

    console.warn(
      `[rate-limit] ${name}: Redis unreachable — FAILING OPEN, request allowed ` +
        `and NOT metered. Check UPSTASH_REDIS_REST_URL. Cause: ${reason}`
    );
    return { limited: false };
  } finally {
    clearTimeout(timer);
  }
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

/**
 * AI Workout Parsing Rate Limiter
 * ───────────────────────────────
 * 10 requests per user per 24-hour sliding window.
 *
 * WHY 10 (and not the meal parser's 15)?
 * A workout is logged once a day, not four times. 10 covers the session plus
 * re-parses after an edit, and keeps its own budget: a user who has spent the
 * day describing meals must still be able to log the gym.
 *
 * WHY ITS OWN PREFIX: shared keys would make one feature's traffic silently
 * throttle the other, and the two limits are tuned for different behaviour.
 */
const workoutParserLimiter = (() => {
  const redis = getRedis();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 d"),
    prefix: "fitlog:ai:workout",
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

  return runLimit(mealParserLimiter, userId, "meal parser");
}

/**
 * Check if a user has exceeded their AI workout parsing rate limit.
 *
 * @returns { limited: false } if Redis is not configured (development mode)
 */
export async function checkWorkoutParserLimit(
  userId: string
): Promise<RateLimitResult> {
  if (!workoutParserLimiter) {
    return { limited: false };
  }

  return runLimit(workoutParserLimiter, userId, "workout parser");
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

  return runLimit(insightLimiter, userId, "weekly insight");
}
