/**
 * POST /api/workout/[id]/cancel — discard an active workout
 *
 * The user tapped "Discard workout". This soft-cancels the session
 * (status = CANCELLED) rather than deleting it: the logged sets stay in the
 * database so a mis-tap is recoverable, while getSessionsByDate hides
 * CANCELLED so the workout leaves the UI as the user expects.
 *
 * This is the ONLY path that writes CANCELLED. The stale-session reaper
 * deliberately never does — it cannot tell "abandoned" from "unfinished",
 * whereas a user pressing discard is telling us directly.
 *
 * Ownership and status are enforced by the same locked check every other
 * session mutation uses, so a session that is not yours, already finished, or
 * already cancelled answers 404 (never "forbidden" — no IDOR oracle).
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { discardSession } from "@/lib/services/workout.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const result = await discardSession(sessionId, userId);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "POST /api/workout/[id]/cancel");
  }
}
