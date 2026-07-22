/**
 * GET  /api/share — list my share links
 * POST /api/share — create a share link for a template I own
 *
 * Same-origin proxy to the Django service (see lib/services/django.service.ts).
 * The browser calls THIS; we forward the user's JWT to Django and mirror
 * its status codes back.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { djangoAuthedFetch } from "@/lib/services/django.service";
import { handleRouteError } from "@/lib/utils/errors";

const createShareSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const res = await djangoAuthedFetch("/api/share-links/");
    return NextResponse.json(res.data, { status: res.status });
  } catch (error) {
    return handleRouteError(error, "GET /api/share");
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

    const parsed = createShareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid share request",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const res = await djangoAuthedFetch("/api/share-links/", {
      method: "POST",
      body: { kind: "WORKOUT_TEMPLATE", ...parsed.data },
    });
    return NextResponse.json(res.data, { status: res.status });
  } catch (error) {
    return handleRouteError(error, "POST /api/share");
  }
}
