/**
 * Goals API Route
 * ═══════════════
 *
 * POST   /api/goals — set (create or replace) the user's active weight goal
 * DELETE /api/goals — remove the active weight goal
 *
 * Used by the Settings "Goal" card. The onboarding flow creates the first goal
 * directly in its transaction; this route is for changing it afterwards.
 * There is at most ONE ACTIVE goal per user (setActiveGoal retires the old one).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  setActiveGoal,
  abandonActiveGoals,
} from "@/lib/repositories/progress.repository";
import { handleRouteError } from "@/lib/utils/errors";

const setGoalSchema = z.object({
  type: z.enum(["LOSE_FAT", "GAIN_MUSCLE", "MAINTAIN", "RECOMP"]),
  startValue: z.number().min(30).max(300),
  targetValue: z.number().min(30).max(300),
  timelineMonths: z.number().min(1).max(24).default(4),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = setGoalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid goal", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { type, startValue, targetValue, timelineMonths } = parsed.data;
    const now = new Date();
    const goal = await setActiveGoal(userId, {
      type,
      startValue,
      targetValue,
      startDate: now,
      targetDate: new Date(
        now.getTime() + timelineMonths * 30 * 24 * 60 * 60 * 1000
      ),
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/goals");
  }
}

export async function DELETE() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const removed = await abandonActiveGoals(userId);
    return NextResponse.json({ removed });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/goals");
  }
}
