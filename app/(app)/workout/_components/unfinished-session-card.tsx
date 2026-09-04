"use client";

/**
 * Unfinished Session Card — resume a workout that was never finished
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * ────────────────
 * A session row is created the moment someone taps "Start workout", and the
 * only way it ever became COMPLETED was tapping "Finish" in that same browser
 * session. Two very ordinary things left workouts stranded IN_PROGRESS with no
 * way back:
 *
 *   1. You log your sets and walk out of the gym without tapping finish.
 *   2. You refresh the page (or your phone drops the tab) mid-workout —
 *      `activeSessionId` is React state, so it resets to null.
 *
 * In both cases the workout page only rendered COMPLETED sessions, so your
 * logged sets became invisible: the day showed "No sessions logged for this
 * day yet" while the sets sat in the database.
 *
 * This card surfaces those sessions and hands them back. "Resume" simply
 * re-adopts the session as the active one, which drops you into the normal
 * logging flow — add exercises, edit sets, finish — with no separate
 * finish-an-old-workout code path to keep in sync.
 *
 * Pairs with the reaper (see reapStaleSessions): empty stale sessions are
 * deleted as litter, sessions WITH sets are kept forever precisely so they can
 * be resumed here.
 */

interface UnfinishedSessionCardProps {
  session: {
    id: string;
    exerciseSets: Array<{
      id: string;
      exercise: { id: string; name: string };
    }>;
  };
  /** True when this session belongs to a date before the one being viewed. */
  isPast: boolean;
  onResume: (sessionId: string) => void;
}

export function UnfinishedSessionCard({
  session,
  isPast,
  onResume,
}: UnfinishedSessionCardProps) {
  const setCount = session.exerciseSets.length;

  // Distinct exercise names, in the order they were first logged.
  const exerciseNames: string[] = [];
  for (const set of session.exerciseSets) {
    if (!exerciseNames.includes(set.exercise.name)) {
      exerciseNames.push(set.exercise.name);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-amber-500/30 p-4 lg:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
              Unfinished
            </span>
            <span className="text-xs text-text-muted">
              {setCount} set{setCount !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm text-text-primary mt-1.5 truncate">
            {exerciseNames.join(" · ")}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        {isPast
          ? "This workout was never finished. Resume it to add sets or close it out — nothing was lost."
          : "Picked up where you left off. Resume to keep logging or finish this workout."}
      </p>

      <button
        type="button"
        onClick={() => onResume(session.id)}
        className="w-full py-2.5 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors text-sm"
      >
        Resume workout
      </button>
    </div>
  );
}
