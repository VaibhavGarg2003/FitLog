/**
 * Progress Summary API Route
 * ══════════════════════════
 *
 * GET /api/progress/summary?range=1M|3M|6M|1Y|ALL
 *
 * The numbers and chart series behind the Progress page's range tabs:
 * weight trend, strength progress, consistency, nutrition vs the targets in
 * force at the time. Computed by code from a few grouped queries — no AI, no
 * rate limit. An unknown range falls back to 3M.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { getProgressSummary } from "@/lib/services/progress-summary.service";
import { summaryRangeSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const range = summaryRangeSchema.parse(request.nextUrl.searchParams.get("range") ?? undefined);
    return NextResponse.json(await getProgressSummary(userId, range));
  } catch (error) {
    return handleRouteError(error, "GET /api/progress/summary");
  }
}
