/**
 * POST /api/templates/[id]/append — add a session's exercises to a template
 *
 * Body: { fromSessionId, exerciseIds? }. Derives the (subset of) exercises
 * SERVER-SIDE from the session's real sets and merges them into the existing
 * template (dedup by exercise). Owner-scoped: a non-owned template or session
 * id returns 404, never "forbidden".
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { appendSessionToTemplate } from "@/lib/services/template.service";
import { appendToTemplateSchema } from "@/lib/validators/api.schema";
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = appendToTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await appendSessionToTemplate(userId, id, {
      sessionId: parsed.data.fromSessionId,
      exerciseIds: parsed.data.exerciseIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "POST /api/templates/[id]/append");
  }
}
