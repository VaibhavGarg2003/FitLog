/**
 * AI Reports Overview API Route
 * ═════════════════════════════
 *
 * GET /api/insights — the report cards for the Progress page:
 *   weekly (if the user's plan includes it), monthly, and quarterly/yearly
 *   once they exist; the free first-week card; the archive of past reports.
 *
 * Read-only and cheap: it never calls the AI and is not rate-limited.
 * Generating happens only in POST /api/insights/generate.
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { getInsightsOverview } from "@/lib/services/insight.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(await getInsightsOverview(userId));
  } catch (error) {
    return handleRouteError(error, "GET /api/insights");
  }
}
