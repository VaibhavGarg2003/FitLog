/**
 * POST /api/workout — Start a new workout session
 * GET  /api/workout?date=2026-07-07 — Get sessions for a date
 *
 * IMPORTANT: Calorie burn values stored by this API are for
 * INFORMATION ONLY. They must NEVER be added to the daily
 * calorie budget. The TDEE already includes gym activity.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  startSession,
  getWorkoutsByDate,
} from "@/lib/services/workout.service";
import { startWorkoutSchema } from "@/lib/validators/api.schema";
import { localDateStr } from "@/lib/utils/local-date";
import { handleRouteError } from "@/lib/utils/errors";

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

    const parsed = startWorkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid workout data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const session = await startSession(userId, {
      // Client normally sends its local date; localDateStr() is the fallback
      // (never toISOString — that's the UTC midnight bug, CONTEXT.md).
      date: parsed.data.date ?? localDateStr(),
      mode: parsed.data.mode,
      splitType: parsed.data.splitType,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/workout");
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || localDateStr();

    const sessions = await getWorkoutsByDate(userId, date);
    return NextResponse.json(sessions);
  } catch (error) {
    return handleRouteError(error, "GET /api/workout");
  }
}
