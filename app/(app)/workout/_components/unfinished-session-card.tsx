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

import { useState } from "react";

interface UnfinishedSessionCardProps {
  session: {
    id: string;
    exerciseSets: Array<{
      id: string;
      exercise: { id: string; name: string };
    }>;
  };
  /** The session's own date, "YYYY-MM-DD". Shown because this list spans
   *  all dates — the date strip only reaches back 7 days. */
  sessionDate: string;
  /** True when the session is from a day before today. */
  isPast: boolean;
  onResume: (sessionId: string) => void;
  /** Permanently delete this session and its sets. No undo. */
  onDelete: (sessionId: string) => void;
  deleting?: boolean;
}

export function UnfinishedSessionCard({
  session,
  sessionDate,
  isPast,
  onResume,
  onDelete,
  deleting = false,
}: UnfinishedSessionCardProps) {
  // Two-step confirm: deleting destroys logged sets with no recovery, so a
  // single mis-tap must not be enough. Same pattern as "Discard workout".
  const [confirming, setConfirming] = useState(false);
  const setCount = session.exerciseSets.length;

  // "21 Jul 2026" — parsed as local, not UTC, so the label cannot slip a day.
  const [y, m, d] = sessionDate.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

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
            <span className="text-xs font-medium text-text-secondary">
              {label}
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
          ? "Never finished. Resume to add sets or close it out — nothing was lost."
          : "Still open. Resume to keep logging or finish this workout."}
      </p>

      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-red-400">
            Delete this workout and its {setCount} logged set
            {setCount !== 1 ? "s" : ""}? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(session.id)}
              className="flex-1 py-2.5 bg-red-500/15 text-red-400 font-semibold rounded-xl hover:bg-red-500/25 disabled:opacity-50 transition-colors text-sm"
            >
              {deleting ? "Deleting..." : "Yes, delete it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 py-2.5 bg-surface border border-border text-text-secondary font-medium rounded-xl hover:text-text-primary transition-colors text-sm"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onResume(session.id)}
            className="flex-1 py-2.5 bg-primary/10 text-primary font-semibold rounded-xl hover:bg-primary/20 transition-colors text-sm"
          >
            Resume workout
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="px-4 py-2.5 bg-surface border border-border text-text-muted font-medium rounded-xl hover:border-red-500/40 hover:text-red-400 transition-colors text-sm whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
