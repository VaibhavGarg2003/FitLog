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
 *   • "+ sets"  → reopen the exercise in the SetLogger (numbering continues)
 *   • ✎ per set → inline editor: weight, reps, intensity (RPE, clearable),
 *                 warmup toggle — Save / Cancel / Delete
 *
 * Mutations go through useUpdateSet / useDeleteSet → PATCH / DELETE
 * /api/workout/[id]/sets (owner-scoped, IN_PROGRESS sessions only) and
 * invalidate the sessions query, so the card re-renders from fresh data.
 */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useUpdateSet, useDeleteSet } from "@/lib/hooks/use-workout";

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
  /** Reopen an exercise in the SetLogger; nextSetNumber continues numbering. */
  onAddSets: (exercise: ActiveSet["exercise"], nextSetNumber: number) => void;
}

interface Draft {
  weight: string;
  reps: string;
  rpe: string;
  isWarmup: boolean;
}

export function LoggedExercises({
  sets,
  sessionId,
  date,
  activeExerciseId,
  onAddSets,
}: LoggedExercisesProps) {
  const updateSet = useUpdateSet(date);
  const deleteSet = useDeleteSet(date);

  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    weight: "",
    reps: "",
    rpe: "",
    isWarmup: false,
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Group sets by exercise, keeping first-logged order.
  const groups: { exercise: ActiveSet["exercise"]; sets: ActiveSet[] }[] = [];
  for (const set of sets) {
    const entry = groups.find((g) => g.exercise.id === set.exercise.id);
    if (entry) entry.sets.push(set);
    else groups.push({ exercise: set.exercise, sets: [set] });
  }

  if (groups.length === 0) return null;

  function startEdit(set: ActiveSet) {
    setEditingSetId(set.id);
    setEditError(null);
    setDraft({
      weight: set.weight != null ? String(set.weight) : "",
      reps: set.reps != null ? String(set.reps) : "",
      rpe: set.rpe != null ? String(set.rpe) : "",
      isWarmup: set.isWarmup,
    });
  }

  async function saveEdit(set: ActiveSet) {
    const weight = parseFloat(draft.weight);
    const reps = parseInt(draft.reps, 10);
    if (isNaN(weight) || weight < 0 || isNaN(reps) || reps <= 0) {
      setEditError("Enter a valid weight and reps.");
      return;
    }
    const rpe = draft.rpe === "" ? null : parseInt(draft.rpe, 10);
    if (rpe !== null && (isNaN(rpe) || rpe < 1 || rpe > 10)) {
      setEditError("Intensity must be 1–10 (or empty).");
      return;
    }
    try {
      await updateSet.mutateAsync({
        sessionId,
        setId: set.id,
        weight,
        reps,
        rpe,
        isWarmup: draft.isWarmup,
      });
      setEditingSetId(null);
      setEditError(null);
    } catch {
      setEditError("Could not save the set. Try again.");
    }
  }

  async function removeSet(set: ActiveSet) {
    try {
      await deleteSet.mutateAsync({ sessionId, setId: set.id });
      setEditingSetId(null);
    } catch {
      setEditError("Could not delete the set. Try again.");
    }
  }

  const busy = updateSet.isPending || deleteSet.isPending;

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Logged this session
      </p>
      <div className="divide-y divide-border">
        {groups.map((group) => {
          const isCurrent = activeExerciseId === group.exercise.id;
          const maxSetNumber = Math.max(...group.sets.map((s) => s.setNumber));
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
                    onClick={() => onAddSets(group.exercise, maxSetNumber + 1)}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    + sets
                  </button>
                )}
              </div>

              {/* Set rows */}
              <div className="mt-2 space-y-1">
                {group.sets.map((set) =>
                  editingSetId === set.id ? (
                    /* Inline editor */
                    <div
                      key={set.id}
                      className="bg-background rounded-lg border border-border p-2 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={draft.weight}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, weight: e.target.value }))
                          }
                          placeholder="kg"
                          aria-label="Weight (kg)"
                          className="w-16 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
                        />
                        <span className="text-xs text-text-muted">kg ×</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={draft.reps}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, reps: e.target.value }))
                          }
                          placeholder="reps"
                          aria-label="Reps"
                          className="w-14 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10}
                          value={draft.rpe}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, rpe: e.target.value }))
                          }
                          placeholder="RPE"
                          aria-label="Intensity (RPE 1-10, optional)"
                          className="w-14 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
                        />
                        <label className="flex items-center gap-1 text-xs text-text-muted ml-auto">
                          <input
                            type="checkbox"
                            checked={draft.isWarmup}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                isWarmup: e.target.checked,
                              }))
                            }
                            className="accent-primary"
                          />
                          warm-up
                        </label>
                      </div>
                      {editError && (
                        <p className="text-xs text-red-400">{editError}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => saveEdit(set)}
                          disabled={busy}
                          className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                          {updateSet.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSetId(null)}
                          disabled={busy}
                          className="text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSet(set)}
                          disabled={busy}
                          className="ml-auto text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          {deleteSet.isPending ? "Deleting..." : "Delete set"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Read row */
                    <div
                      key={set.id}
                      className="flex items-center gap-2 pl-7 pr-1"
                    >
                      <span className="text-xs text-text-muted w-10 shrink-0">
                        Set {set.setNumber}
                      </span>
                      <span className="text-xs text-text-secondary flex-1 truncate">
                        {set.weight != null && set.reps != null
                          ? `${set.weight}kg × ${set.reps}`
                          : `${set.reps ?? "—"} reps`}
                        {set.rpe != null ? ` · RPE ${set.rpe}` : ""}
                        {set.isWarmup ? " · warm-up" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(set)}
                        aria-label={`Edit set ${set.setNumber} of ${group.exercise.name}`}
                        className="shrink-0 p-1 text-text-muted hover:text-primary transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
