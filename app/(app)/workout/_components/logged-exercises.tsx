"use client";

/**
 * Logged Exercises — the "Logged this session" card
 * ══════════════════════════════════════════════════
 *
 * Lists every exercise logged in the ACTIVE session (grouped, first-logged
 * order) straight from the server data, which is refetched after every
 * mutation — so it is always the source of truth.
 *
 * FULLY EDITABLE, by intention:
 *   • "+ sets"  → reopen the exercise in the SetLogger
 *   • ✎ per set → inline editor (weight, reps, intensity, warm-up, delete),
 *                 which lives in <SetRow> so the SetLogger can offer the
 *                 exact same editor when you reopen an exercise.
 *
 * Mutations go through useUpdateSet / useDeleteSet → PATCH / DELETE
 * /api/workout/[id]/sets (owner-scoped, IN_PROGRESS sessions only) and
 * invalidate the sessions query, so the card re-renders from fresh data.
 */

import { SetRow } from "./set-row";

export interface ActiveSet {
  id: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  isWarmup: boolean;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    category: string;
    metValue: number;
    isCompound: boolean;
  };
}

interface LoggedExercisesProps {
  sets: ActiveSet[];
  sessionId: string;
  date: string;
  activeExerciseId?: string | null;
  /** Reopen an exercise in the SetLogger; it derives its own set numbering. */
  onAddSets: (exercise: ActiveSet["exercise"]) => void;
}

export function LoggedExercises({
  sets,
  sessionId,
  date,
  activeExerciseId,
  onAddSets,
}: LoggedExercisesProps) {
  // Group sets by exercise, keeping first-logged order.
  const groups: { exercise: ActiveSet["exercise"]; sets: ActiveSet[] }[] = [];
  for (const set of sets) {
    const entry = groups.find((g) => g.exercise.id === set.exercise.id);
    if (entry) entry.sets.push(set);
    else groups.push({ exercise: set.exercise, sets: [set] });
  }

  if (groups.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Logged this session
      </p>
      <div className="divide-y divide-border">
        {groups.map((group) => {
          const isCurrent = activeExerciseId === group.exercise.id;
          return (
            <div
              key={group.exercise.id}
              className={`p-3 px-4 ${isCurrent ? "bg-primary/5" : ""}`}
            >
              {/* Exercise header */}
              <div className="flex items-center gap-3">
                <span className="text-base leading-none">✅</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-text-primary truncate">
                    {group.exercise.name}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {group.exercise.muscleGroup} · {group.sets.length} set
                    {group.sets.length !== 1 ? "s" : ""}
                  </span>
                </span>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onAddSets(group.exercise)}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    + sets
                  </button>
                )}
              </div>

              {/* Set rows */}
              <div className="mt-2 space-y-1">
                {group.sets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    sessionId={sessionId}
                    date={date}
                    exerciseName={group.exercise.name}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
