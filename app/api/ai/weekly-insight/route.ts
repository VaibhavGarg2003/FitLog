/**
 * Weekly Insight API Route
 * ════════════════════════
 *
 * GET  /api/ai/weekly-insight  → READ the cached insight (cheap, UNLIMITED)
 * POST /api/ai/weekly-insight  → GENERATE a new insight (LLM call, RATE-LIMITED)
 *
 * WHY TWO VERBS (this is the fix for the "permanent 429" bug):
 * ───────────────────────────────────────────────────────────
 * The old route rate-limited EVERY request — including just viewing an
 * already-generated insight. Once a user spent their 2 weekly tokens, they
 * were locked out of even READING the insight sitting in their own database.
 *
 * The expensive thing is *generation* (the LLM call), not *reading*. So:
 *   • GET  only reads the DB cache. No rate limit. Safe to call on every mount.
 *   • POST performs the LLM generation. This is where the 2/week limit belongs.
 *
 * This also fixes a REST smell: generation writes to the DB and calls an
 * external API, so it is not a "safe" operation and does not belong on GET.
 *
 * RESPONSE SHAPE:
 * ───────────────
 * GET  (cache hit):  { generated: true,  insight, highlights, suggestion, weekStart, provider, cached: true }
 * GET  (cache miss): { generated: false }
 * POST (success):    { generated: true,  insight, highlights, suggestion, weekStart, provider, cached: false }
 * POST (limited):    429 { error, remaining, resetAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  generateWeeklyInsight,
  getCachedWeeklyInsight,
} from "@/lib/services/ai.service";
import { checkInsightLimit } from "@/lib/middleware/rate-limit";
import { UserFacingError } from "@/lib/utils/errors";

/**
 * Extract the client's local date ("YYYY-MM-DD") from ?date=.
 * The server runs in UTC — "this week" must be computed from the USER'S
 * calendar date, never the server clock. Invalid/missing → undefined
 * (service falls back to server date).
 */
function getClientDate(request: NextRequest): string | undefined {
  const date = request.nextUrl.searchParams.get("date");
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

/** Return the message only if it was written FOR users; otherwise generic. */
function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback;
}

/**
 * GET — return this week's cached insight if it exists.
 * Read-only, so NOT rate-limited. The Progress page calls this on mount.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cached = await getCachedWeeklyInsight(userId, getClientDate(request));
    if (cached) {
      return NextResponse.json({ generated: true, ...cached });
    }
    // No insight yet — tell the client so it can offer a "Generate" button.
    return NextResponse.json({ generated: false });
  } catch (error: unknown) {
    console.error("[Weekly Insight GET] Error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to read insight") },
      { status: 500 }
    );
  }
}

/**
 * POST — generate (or regenerate) this week's insight via the LLM.
 * This is the expensive path, so the 2-per-week rate limit lives here.
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkInsightLimit(userId);
  if (rateLimit.limited) {
    return NextResponse.json(
      {
        error:
          "Weekly insight limit reached (2 per week). Try again next week.",
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      },
      { status: 429 }
    );
  }

  try {
    const result = await generateWeeklyInsight(userId, getClientDate(request));
    return NextResponse.json({ generated: true, ...result });
  } catch (error: unknown) {
    console.error("[Weekly Insight POST] Error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Insight generation failed") },
      { status: 500 }
    );
  }
}
