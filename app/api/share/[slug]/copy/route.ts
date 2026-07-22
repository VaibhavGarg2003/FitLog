/**
 * POST /api/share/[slug]/copy — import a shared plan into MY account
 *
 * The growth moment: a friend viewed the public plan and wants it. Django
 * writes a workout_templates row for the caller (or 409s if they haven't
 * onboarded yet). We forward the JWT and mirror the status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { djangoAuthedFetch } from "@/lib/services/django.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { slug } = await params;
    const res = await djangoAuthedFetch(
      `/api/share-links/${encodeURIComponent(slug)}/copy`,
      { method: "POST" }
    );
    return NextResponse.json(res.data, { status: res.status });
  } catch (error) {
    return handleRouteError(error, "POST /api/share/[slug]/copy");
  }
}
