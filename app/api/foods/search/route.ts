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
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/supabase/prisma";

export async function GET(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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

    // Case-insensitive search using Prisma's `contains` with `insensitive` mode
    const foods = await prisma.food.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { nameHindi: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        nameHindi: true,
        category: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        fiberPer100g: true,
        defaultUnit: true,
        defaultQuantity: true,
        defaultGrams: true,
        restaurantMultiplier: true,
        source: true,
      },
    });

    return NextResponse.json({ foods, count: foods.length });
  } catch (error) {
    console.error("[GET /api/foods/search] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
