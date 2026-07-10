/**
 * POST /api/workout/[id]/sets — Add a set to a session
 * PUT  /api/workout/[id]/sets — Finish session (calculates burn)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { logSet, finishSession } from "@/lib/services/workout.service";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const body = await request.json();

    const set = await logSet(sessionId, {
      exerciseId: body.exerciseId,
      setNumber: body.setNumber,
      weight: body.weight,
      reps: body.reps,
      rpe: body.rpe,
      isWarmup: body.isWarmup,
    });

    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workout/[id]/sets]", error);
    return NextResponse.json(
      { error: "Failed to add set" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const body = await request.json();

    // Get user's weight for calorie burn calculation
    const profile = await getProfileByUserId(userId);
    const userWeightKg = profile?.weightKg ?? 70;

    const session = await finishSession(sessionId, userId, {
      durationMin: body.durationMin,
      rpe: body.rpe,
      userWeightKg,
      notes: body.notes,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("[PUT /api/workout/[id]/sets]", error);
    return NextResponse.json(
      { error: "Failed to finish session" },
      { status: 500 }
    );
  }
}
