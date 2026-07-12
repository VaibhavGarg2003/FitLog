/**
 * POST /api/nutrition/log — Log a food item
 *
 * POST body:
 *   { foodId, date, mealType, quantityGrams, isRestaurant }
 *   OR for custom foods:
 *   { date, mealType, name, quantity, unit, calories, protein, carbs, fat }
 *
 * Deleting a food item is DELETE /api/nutrition/log/[id] — the id lives in
 * the URL (see that route for why DELETE bodies are a smell).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  logFoodItem,
  logCustomFood,
} from "@/lib/services/nutrition.service";
import { z } from "zod";
import {
  logDbFoodSchema,
  logCustomFoodSchema,
} from "@/lib/validators/api.schema";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 3. Validate, then route to the correct service. No request body
    //    reaches the service layer unvalidated — a client sending
    //    { calories: -99999 } must be rejected here, not silently written.
    const isDbFood =
      typeof body === "object" && body !== null && "foodId" in body;

    if (isDbFood) {
      const parsed = logDbFoodSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid food log data",
            details: z.flattenError(parsed.error).fieldErrors,
          },
          { status: 400 }
        );
      }
      const result = await logFoodItem(userId, parsed.data);
      return NextResponse.json(result, { status: 201 });
    } else {
      const parsed = logCustomFoodSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid food log data",
            details: z.flattenError(parsed.error).fieldErrors,
          },
          { status: 400 }
        );
      }
      const result = await logCustomFood(userId, parsed.data);
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

