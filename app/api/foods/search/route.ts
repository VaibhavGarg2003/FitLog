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
import { findCustomFoods } from "@/lib/services/custom-food.service";
import { handleRouteError } from "@/lib/utils/errors";

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

    // Two sources, one list: the shared seeded table and this user's own saved
    // foods. The user's entries are listed FIRST — someone who has saved their
    // whey macros means "use these", so making them scroll past the generic
    // average would defeat the point of saving them.
    const [seeded, custom] = await Promise.all([
      searchFoodsByName(query, limit),
      findCustomFoods(userId, query, limit),
    ]);

    const foods = [
      ...custom.map((f) => ({
        id: f.id,
        name: f.name,
        nameHindi: null,
        category: f.category,
        caloriesPer100g: f.caloriesPer100g,
        proteinPer100g: f.proteinPer100g,
        carbsPer100g: f.carbsPer100g,
        fatPer100g: f.fatPer100g,
        fiberPer100g: f.fiberPer100g,
        defaultUnit: f.defaultUnit,
        defaultQuantity: 1,
        defaultGrams: f.defaultGrams,
        // Custom foods carry no restaurant markup — a tub of protein powder
        // doesn't get cooked in someone else's oil.
        restaurantMultiplier: 1,
        source: "CUSTOM" as const,
        isCustom: true as const,
      })),
      ...seeded.map((f) => ({ ...f, isCustom: false as const })),
    ].slice(0, limit);

    return NextResponse.json({ foods, count: foods.length });
  } catch (error) {
    return handleRouteError(error, "GET /api/foods/search");
  }
}
