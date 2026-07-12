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
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { parseMealText } from "@/lib/services/ai.service";
import { checkMealParserLimit } from "@/lib/middleware/rate-limit";
import { parseMealRequestSchema } from "@/lib/validators/api.schema";
import { UserFacingError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  // 1. Auth check
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate the body BEFORE the rate limit.
  //    Validation is free; the rate limit meters the scarce resource (the
  //    LLM call). Checking the limit first meant a buggy client burned its
  //    15 daily tokens on malformed requests that never reached the LLM.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = parseMealRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          z.flattenError(parsed.error).fieldErrors.text?.[0] ??
          "Invalid meal request",
        details: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 400 }
    );
  }

  // 3. Rate limit check — only valid requests spend a token
  const rateLimit = await checkMealParserLimit(userId);
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

  // 4. Call AI service
  try {
    const result = await parseMealText(
      userId,
      parsed.data.text,
      parsed.data.mealType,
      parsed.data.date
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    // Full details go to the server log; the client only ever sees messages
    // written FOR users (UserFacingError) — internal errors can carry
    // provider/infra details that must not leak.
    console.error("[AI Parse Meal] Error:", error);

    const message =
      error instanceof UserFacingError
        ? error.message
        : "AI parsing failed. Please try again or log your meal manually.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
