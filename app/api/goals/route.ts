/**
 * Goals API Route
 * ═══════════════
 *
 * POST   /api/goals — set (create or replace) the user's active weight goal
 * DELETE /api/goals — remove the active weight goal
 *
 * Used by the Settings "Goal" card. The onboarding flow creates the first goal
 * directly in its transaction; this route is for changing it afterwards.
 * There is at most ONE ACTIVE goal per user (the old one is retired, not
 * deleted).
 *
 * A GOAL CHANGE IS A TARGET CHANGE: the goal's target weight and deadline
 * drive the calorie engine, so both verbs recalculate the user's targets and
 * record target history in the same transaction as the goal write
 * (profile.service setWeightGoal / removeWeightGoal).
 *
 * `timezone` (optional, both verbs): the browser's zone. Used only when the
 * account has no stored zone yet, to date the goal and the history row on the
 * user's calendar; dropped if unrecognised rather than failing the request.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { removeWeightGoal, setWeightGoal } from "@/lib/services/profile.service";
import { timezoneSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

const setGoalSchema = z.object({
  type: z.enum(["LOSE_FAT", "GAIN_MUSCLE", "MAINTAIN", "RECOMP"]),
  startValue: z.number().min(30).max(300),
  targetValue: z.number().min(30).max(300),
  timelineMonths: z.number().min(1).max(24).default(4),
  timezone: timezoneSchema.optional().catch(undefined),
});

const removeGoalSchema = z.object({
  timezone: timezoneSchema.optional().catch(undefined),
});

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

    const parsed = setGoalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid goal", details: z.flattenError(parsed.error).fieldErrors },
        { status: 400 }
      );
    }

    const { timezone, ...goal } = parsed.data;
    const result = await setWeightGoal(userId, goal, { deviceTimeZone: timezone });

    // Same shape as before (the goal row); the client refetches the profile
    // for the recalculated targets.
    return NextResponse.json(result.goal, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "POST /api/goals");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The body is optional here (older clients send none) and only ever
    // carries the device timezone, so an empty or unreadable one is fine.
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = removeGoalSchema.safeParse(body ?? {});
    const timezone = parsed.success ? parsed.data.timezone : undefined;

    const result = await removeWeightGoal(userId, { deviceTimeZone: timezone });
    return NextResponse.json({ removed: result.removed });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/goals");
  }
}
