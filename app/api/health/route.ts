/**
 * Health Check API Route
 * ══════════════════════
 *
 * GET /api/health
 *
 * Two purposes:
 * 1. Supabase Keep-Alive: Pinged every 3 days by GitHub Actions
 *    to prevent Supabase free tier from pausing the project
 *    after 7 days of inactivity.
 *
 * 2. Monitoring: Quick check to verify the app and database
 *    are both responsive.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/supabase/prisma";

export async function GET(request: NextRequest) {
  // CRON_SECRET, when set, gates this endpoint (Authorization: Bearer <secret>).
  // When unset/empty the endpoint stays public — fine for uptime pings.
  // The point is that the variable is now WIRED: config that looks like
  // security but checks nothing is a booby trap for the next reader.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Trivial query — just checks that the database connection works
    const startMs = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    const dbLatencyMs = Date.now() - startMs;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
      dbLatencyMs,
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      },
      { status: 503 }
    );
  }
}
