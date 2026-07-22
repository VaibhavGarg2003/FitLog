/**
 * DELETE /api/share/[slug] — revoke one of my share links
 *
 * Owner-scoping is enforced by Django (non-owner slug → 404, never 403).
 * We just forward the JWT and mirror the status.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { djangoAuthedFetch } from "@/lib/services/django.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function DELETE(
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
      `/api/share-links/${encodeURIComponent(slug)}`,
      { method: "DELETE" }
    );
    return NextResponse.json(res.data, { status: res.status });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/share/[slug]");
  }
}
