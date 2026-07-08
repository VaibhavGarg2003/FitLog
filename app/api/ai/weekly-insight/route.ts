/**
 * Weekly Insight API Route
 * ════════════════════════
 *
 * GET /api/ai/weekly-insight
 *
 * WHAT IT DOES:
 * ─────────────
 * Generates (or returns cached) a personalised weekly coaching summary.
 * The LLM reads 7 days of nutrition, workout, and weight data.
 *
 * FLOW:
 * ─────
 * 1. Auth check
 * 2. Rate limit check (2 per week — allows 1 regeneration)
 * 3. Call generateWeeklyInsight() from ai.service.ts
 *    - If cached → returns instantly (no LLM call)
 *    - If not → generates, saves, returns
 *
 * RESPONSE:
 * ─────────
 * {
 *   insight: "This week you averaged...",
 *   highlights: ["Good protein consistency", ...],
 *   suggestion: "Try adding a boiled egg to breakfast",
 *   weekStart: "2026-07-01",
 *   provider: "gemini",
 *   cached: true
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklyInsight } from "@/lib/services/ai.service";
import { checkInsightLimit } from "@/lib/middleware/rate-limit";

export async function GET() {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit check
  const rateLimit = await checkInsightLimit(user.id);
  if (rateLimit.limited) {
    return NextResponse.json(
      {
        error: "Weekly insight limit reached. Your current insight is still available.",
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      },
      { status: 429 }
    );
  }

  // 3. Generate or return cached insight
  try {
    const result = await generateWeeklyInsight(user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Insight generation failed";

    console.error("[Weekly Insight] Error:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
