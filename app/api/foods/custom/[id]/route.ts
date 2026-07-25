/**
 * Custom Food — single row
 * ════════════════════════
 *
 * PATCH  /api/foods/custom/[id]  — edit macros (e.g. switched brands)
 * DELETE /api/foods/custom/[id]  — remove it from search
 *
 * Both are owner-scoped in the repository query, so a valid id belonging to
 * someone else answers 404 rather than 403 — we never confirm that another
 * user's row exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  editCustomFood,
  removeCustomFood,
} from "@/lib/services/custom-food.service";
import { updateCustomFoodSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateCustomFoodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid food data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const food = await editCustomFood(id, userId, parsed.data);
    return NextResponse.json({ food });
  } catch (error) {
    return handleRouteError(error, "PATCH /api/foods/custom/[id]");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await removeCustomFood(id, userId);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "DELETE /api/foods/custom/[id]");
  }
}
