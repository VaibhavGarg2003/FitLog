/**
 * DELETE /api/workout/[id] — permanently delete a workout session
 *
 * HARD delete, unlike POST /api/workout/[id]/cancel which soft-cancels.
 * The two exist for genuinely different intentions:
 *
 *   cancel  — "I'm abandoning this workout." The row stays as CANCELLED and
 *             its sets are kept, so a mis-tap is recoverable.
 *   delete  — "Get rid of this entirely." Used by the Unfinished-workouts
 *             list, where an old session the user will never finish is just
 *             clutter. The sets go with it via ON DELETE CASCADE.
 *
 * Because this destroys logged sets with no recovery path, the UI confirms
 * before calling it (see unfinished-session-card.tsx).
 *
 * Ownership is enforced inside the deleting transaction under a row lock, so
 * a set logged concurrently cannot be silently discarded between an ownership
 * check and the DELETE. A session that is missing or belongs to someone else
 * answers 404, never "forbidden".
 */

import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/server";
import { removeSession } from "@/lib/services/workout.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    await removeSession(sessionId, userId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /api/workout/[id]");
  }
}
