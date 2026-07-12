/**
 * Food Search API Route
 * ═════════════════════
 *
 * GET /api/foods/search?q=roti&limit=20
 *
 * Searches the foods table by name (case-insensitive).
 * Returns top matches for the meal logging feature.
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { searchFoodsByName } from "@/lib/repositories/food.repository";

export async function GET(request: Request) {
  try {
    // Auth check
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Case-insensitive search — query logic lives in the food repository
    const foods = await searchFoodsByName(query, limit);

    return NextResponse.json({ foods, count: foods.length });
  } catch (error) {
    console.error("[GET /api/foods/search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
