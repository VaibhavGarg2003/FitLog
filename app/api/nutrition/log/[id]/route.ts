/**
 * DELETE /api/nutrition/log/[id] — Remove a logged food item
 *
 * The id is the MealFood id, carried in the URL — NOT a request body.
 * HTTP semantics: DELETE bodies are undefined behavior; many proxies and
 * caches silently drop them. A resource identifier belongs in the path.
 *
 * Ownership is verified inside the repository (the row must belong to a
 * meal entry owned by this user), so a leaked/guessed id returns 404-ish,
 * never another user's data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { removeFood } from "@/lib/services/nutrition.service";
import { handleRouteError } from "@/lib/utils/errors";

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
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await removeFood(id, userId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/nutrition/log/[id]");
  }
}
