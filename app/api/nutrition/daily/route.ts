/**
 * GET /api/nutrition/daily?date=2026-07-07
 * GET /api/nutrition/daily?date=2026-07-07&full=true
 *
 * Without ?full=true → Returns daily nutrition totals for the dashboard
 *   calorie ring. Used by useDailySummary hook.
 *
 * With ?full=true → Returns full meal entries with individual food items.
 *   Used by useMealsForDate hook (nutrition page meal sections).
 *
 * WHY SAME ENDPOINT?
 * ──────────────────
 * Both the dashboard (summary) and nutrition page (full list) need
 * data for the same date. A single endpoint with a mode flag avoids
 * duplicating the auth check and date parsing logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDailyTotals, getMealsForDate } from "@/lib/services/nutrition.service";

export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get date and mode from query params
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const full = searchParams.get("full") === "true";

    // 3. Return full meal entries (nutrition page) or just totals (dashboard)
    if (full) {
      // Full mode: return MealEntry[] with MealFood items nested
      const meals = await getMealsForDate(user.id, date);
      return NextResponse.json(meals);
    } else {
      // Summary mode: return aggregated totals only
      const totals = await getDailyTotals(user.id, date);
      return NextResponse.json(totals);
    }
  } catch (error) {
    console.error("[GET /api/nutrition/daily]", error);
    return NextResponse.json(
      { error: "Failed to fetch daily summary" },
      { status: 500 }
    );
  }
}

