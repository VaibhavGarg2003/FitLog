/**
 * Generate AI Report API Route
 * ════════════════════════════
 *
 * POST /api/insights/generate  { type: "WEEK"|"MONTH"|"QUARTER"|"YEAR", regenerate? }
 *
 * The ONLY path that calls the AI. The period is never taken from the client:
 * the server derives the last finished period of `type` from the user's
 * calendar. See lib/services/insight.service.ts for the full flow.
 *
 * RESPONSES:
 *   200 { status: "READY", report }      written now, or a saved up-to-date copy
 *   202 { status: "GENERATING" }         another request is writing it — poll GET /api/insights
 *   409 { error, report }                this period was already generated twice
 *   429 { error, resetAt }               the 30-day backstop was reached
 *   400 { error }                        not available yet / not enough data / plan excludes it
 *   502 { error }                        the AI providers failed (the attempt is refunded)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { generateReport } from "@/lib/services/insight.service";
import { generateReportSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

// Room for the report's AI chain (≤30s) plus the database work. Must stay a
// literal (Next reads it statically) and BELOW the generation lease — see
// lib/insights/report-budget.ts (REPORT_ROUTE_MAX_SECONDS, LEASE_SECONDS).
export const maxDuration = 60;

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
    const parsed = generateReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: z.flattenError(parsed.error).fieldErrors },
        { status: 400 }
      );
    }

    const result = await generateReport(userId, parsed.data.type, {
      regenerate: parsed.data.regenerate,
    });

    switch (result.status) {
      case "READY":
        return NextResponse.json(result);
      case "GENERATING":
        return NextResponse.json(result, { status: 202 });
      case "LIMIT":
        return NextResponse.json(
          { ...result, error: "This report has already been written twice for this period." },
          { status: 409 }
        );
      case "RATE_LIMITED":
        return NextResponse.json(
          { ...result, error: "You've reached this month's AI report limit. Try again later." },
          { status: 429 }
        );
    }
  } catch (error) {
    return handleRouteError(error, "POST /api/insights/generate");
  }
}
