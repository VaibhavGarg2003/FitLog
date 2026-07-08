/**
 * POST /api/nutrition/log — Log a food item
 * DELETE /api/nutrition/log — Remove a food item
 *
 * POST body:
 *   { foodId, date, mealType, quantityGrams, isRestaurant }
 *   OR for custom foods:
 *   { date, mealType, name, quantity, unit, calories, protein, carbs, fat }
 *
 * DELETE body:
 *   { mealFoodId }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  logFoodItem,
  logCustomFood,
  removeFood,
} from "@/lib/services/nutrition.service";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();

    // 3. Route to correct service based on whether it's a DB food or custom
    if (body.foodId) {
      // Database food — service calculates calories from quantity
      const result = await logFoodItem(user.id, {
        date: body.date,
        mealType: body.mealType,
        foodId: body.foodId,
        quantityGrams: body.quantityGrams,
        isRestaurant: body.isRestaurant ?? false,
      });
      return NextResponse.json(result, { status: 201 });
    } else {
      // Custom food — user provides all nutrition data
      const result = await logCustomFood(user.id, {
        date: body.date,
        mealType: body.mealType,
        name: body.name,
        quantity: body.quantity,
        unit: body.unit ?? "g",
        calories: body.calories,
        protein: body.protein ?? 0,
        carbs: body.carbs ?? 0,
        fat: body.fat ?? 0,
      });
      return NextResponse.json(result, { status: 201 });
    }
  } catch (error) {
    console.error("[POST /api/nutrition/log]", error);
    return NextResponse.json(
      { error: "Failed to log food" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    if (!body.mealFoodId) {
      return NextResponse.json({ error: "mealFoodId required" }, { status: 400 });
    }

    // 3. Delete (ownership verified inside repository)
    await removeFood(body.mealFoodId, user.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[DELETE /api/nutrition/log]", error);
    return NextResponse.json(
      { error: "Failed to delete food" },
      { status: 500 }
    );
  }
}
