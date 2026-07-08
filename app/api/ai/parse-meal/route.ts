/**
 * AI Meal Parser API Route
 * ════════════════════════
 *
 * POST /api/ai/parse-meal
 *
 * WHAT IT DOES:
 * ─────────────
 * Takes a natural language meal description and converts it into
 * food log entries using the AI fallback chain.
 *
 * FLOW:
 * ─────
 * 1. Auth check → user must be logged in
 * 2. Rate limit check → max 15 AI requests per day per user
 * 3. Call parseMealText() from ai.service.ts
 * 4. Return the logged items with calorie totals
 *
 * REQUEST BODY:
 * ─────────────
 * {
 *   text: "I had 2 rotis with dal and curd",
 *   mealType: "LUNCH",
 *   date: "2026-07-07"
 * }
 *
 * RESPONSE:
 * ─────────
 * {
 *   logged: [{ name: "Roti", quantity: 80, calories: 238, matched: true }, ...],
 *   provider: "gemini",
 *   totalCalories: 450
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseMealText } from "@/lib/services/ai.service";
import { checkMealParserLimit } from "@/lib/middleware/rate-limit";

export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit check
  const rateLimit = await checkMealParserLimit(user.id);
  if (rateLimit.limited) {
    return NextResponse.json(
      {
        error: "Daily AI limit reached. Please use the manual food search.",
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      },
      { status: 429 }
    );
  }

  // 3. Parse request body
  let body: { text?: string; mealType?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { text, mealType, date } = body;

  // 4. Validate
  if (!text || typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json(
      { error: "Please describe your meal (at least 3 characters)" },
      { status: 400 }
    );
  }

  const validMealTypes = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
  if (!mealType || !validMealTypes.includes(mealType)) {
    return NextResponse.json(
      { error: "Invalid meal type" },
      { status: 400 }
    );
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format (use YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // 5. Call AI service
  try {
    const result = await parseMealText(
      user.id,
      text.trim(),
      mealType as "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK",
      date
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "AI parsing failed";

    console.error("[AI Parse Meal] Error:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
