/**
 * PUT    /api/templates/[id] — edit one of my templates (rename / reshape)
 * DELETE /api/templates/[id] — delete one of my templates
 *
 * Owner-scoped: another user's template id (or a nonexistent one) returns
 * 404 — never "forbidden", so we don't reveal that the id exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { removeTemplate, editTemplate } from "@/lib/services/template.service";
import { updateTemplateSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function PUT(
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

    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid template data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await editTemplate(userId, id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "PUT /api/templates/[id]");
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
    const result = await removeTemplate(userId, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "DELETE /api/templates/[id]");
  }
}
