/**
 * GET /api/workout/unfinished — unfinished workouts across ALL dates
 *
 * Deliberately not date-scoped. The workout page's date strip only offers the
 * last 7 days, so a session older than that cannot be reached by navigation —
 * and that is exactly the user the reaper preserves sessions for (someone who
 * logged sets weeks ago and never tapped finish). Scoping this to the selected
 * date would hide the feature from the people who need it most.
 *
 * Only sessions that actually hold sets are returned; an empty one has nothing
 * to resume and is deleted by the reaper as litter.
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { getUnfinishedWorkouts } from "@/lib/services/workout.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await getUnfinishedWorkouts(userId);
    return NextResponse.json(sessions);
  } catch (error) {
    return handleRouteError(error, "GET /api/workout/unfinished");
  }
}
