/**
 * Custom Foods API
 * ════════════════
 *
 * GET    /api/foods/custom   — list this user's saved foods
 * POST   /api/foods/custom   — save one (create-or-replace by name)
 *
 * Per-row edit/delete live in ./[id]/route.ts.
 *
 * Ownership is never taken from the request body — `userId` comes from the
 * session on every call, and the repository scopes each query with it.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { getCustomFoods, saveCustomFood } from "@/lib/services/custom-food.service";
import { customFoodSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const foods = await getCustomFoods(userId);
    return NextResponse.json({ foods });
  } catch (error) {
    return handleRouteError(error, "GET /api/foods/custom");
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = customFoodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid food data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const food = await saveCustomFood(userId, parsed.data);
    return NextResponse.json({ food }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/foods/custom");
  }
}
