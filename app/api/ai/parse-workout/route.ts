/**
 * AI Workout Parser API Route
 * ═══════════════════════════
 *
 * POST /api/ai/parse-workout
 *
 * WHAT IT DOES:
 * ─────────────
 * Takes a natural-language workout paragraph and returns a REVIEWABLE DRAFT.
 * It writes nothing. The user confirms the draft and the client then calls
 * POST /api/workout/ai-import, which is the only path that touches the
 * database.
 *
 * WHY SPLIT IN TWO (the meal parser writes immediately):
 * ──────────────────────────────────────────────────────
 * A misread meal is three rows to delete; a misread workout is ten to twenty,
 * and only deletable while the session is still IN_PROGRESS. An unmatched
 * exercise also has nowhere to go — there is no custom-exercise table — so it
 * needs a human decision, which needs a screen anyway.
 *
 * REQUEST BODY:
 * ─────────────
 * { text: "bench 4 sets - 40x12, 50x10, 55x8, 55x8. 55 minutes" }
 *
 * RESPONSE: a WorkoutDraft (see ai-workout.service.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { parseWorkoutText } from "@/lib/services/ai-workout.service";
import { checkWorkoutParserLimit } from "@/lib/middleware/rate-limit";
import { parseWorkoutSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  // The WHOLE handler is inside the try. Auth (Supabase) and the rate limit
  // (Upstash) are network calls that can throw, and an exception from either
  // must still reach handleRouteError — otherwise it escapes the project's
  // Sentry + correlation-ID handling and surfaces as an unlabelled crash.
  try {
    // 1. Auth
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse + validate BEFORE the rate limit. Validation is free; the limit
    //    meters the scarce resource (the LLM call). Checking the limit first
    //    meant a buggy client burned its daily tokens on malformed requests —
    //    the lesson /api/ai/parse-meal already learned.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = parseWorkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            z.flattenError(parsed.error).fieldErrors.text?.[0] ??
            "Invalid workout request",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    // 3. Rate limit — only valid requests spend a token
    const rateLimit = await checkWorkoutParserLimit(userId);
    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: "Daily AI limit reached. Please log this workout manually.",
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      );
    }

    // 4. Parse. Nothing is written, so this route is safe to retry.
    const draft = await parseWorkoutText(parsed.data.text);
    return NextResponse.json(draft);
  } catch (error: unknown) {
    // UserFacingError family → its status + message; unknown errors → Sentry
    // + generic message + correlation ID. Never leak internals.
    return handleRouteError(error, "POST /api/ai/parse-workout");
  }
}
