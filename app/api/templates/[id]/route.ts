/**
 * DELETE /api/templates/[id] — delete one of my templates
 *
 * Owner-scoped: another user's template id (or a nonexistent one) returns
 * 404 — never "forbidden", so we don't reveal that the id exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { removeTemplate } from "@/lib/services/template.service";
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
    const result = await removeTemplate(userId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "DELETE /api/templates/[id]");
  }
}
