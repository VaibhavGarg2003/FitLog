/**
 * GET  /api/templates — list my workout templates
 * POST /api/templates — save a completed session as a template
 *
 * POST body: { name, fromSessionId }
 * The exercise list is derived server-side from the session's real sets
 * (owner-scoped lookup) — the client never supplies a template payload.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  createTemplateFromSession,
  listTemplates,
} from "@/lib/services/template.service";
import { createTemplateSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await listTemplates(userId);
    return NextResponse.json({ templates });
  } catch (error) {
    return handleRouteError(error, "GET /api/templates");
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

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid template data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const template = await createTemplateFromSession(userId, {
      name: parsed.data.name,
      sessionId: parsed.data.fromSessionId,
      exerciseIds: parsed.data.exerciseIds,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/templates");
  }
}
