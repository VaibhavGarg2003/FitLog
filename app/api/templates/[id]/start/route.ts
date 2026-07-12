/**
 * POST /api/templates/[id]/start — start a workout session from a template
 *
 * Body: { date? }  (client's local date; server-local fallback)
 * Returns: { session, templateName, exercises } — the UI renders the
 * exercises as a planned checklist to log through.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { startSessionFromTemplate } from "@/lib/services/template.service";
import { startFromTemplateSchema } from "@/lib/validators/api.schema";
import { localDateStr } from "@/lib/utils/local-date";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Body is optional ({} is fine) — tolerate an empty body entirely.
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // no body sent — use defaults
    }

    const parsed = startFromTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await startSessionFromTemplate(
      userId,
      id,
      parsed.data.date ?? localDateStr()
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/templates/[id]/start");
  }
}
