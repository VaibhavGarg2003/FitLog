/**
 * POST /api/workout — Start a new workout session
 * GET  /api/workout?date=2026-07-07 — Get sessions for a date
 *
 * IMPORTANT: Calorie burn values stored by this API are for
 * INFORMATION ONLY. They must NEVER be added to the daily
 * calorie budget. The TDEE already includes gym activity.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  startSession,
  getWorkoutsByDate,
} from "@/lib/services/workout.service";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const session = await startSession(user.id, {
      date: body.date || new Date().toISOString().split("T")[0],
      mode: body.mode || "RECALL",
      splitType: body.splitType,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workout]", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    const sessions = await getWorkoutsByDate(user.id, date);
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[GET /api/workout]", error);
    return NextResponse.json(
      { error: "Failed to fetch workouts" },
      { status: 500 }
    );
  }
}
