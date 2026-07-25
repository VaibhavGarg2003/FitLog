"use client";

/**
 * Set Row — one logged set, readable or editable in place
 * ═══════════════════════════════════════════════════════
 *
 * Extracted from <LoggedExercises> so the SAME editor serves both places a
 * user meets an already-logged set:
 *   • the session card ("Logged this session")
 *   • the SetLogger itself, when reopening an exercise that already has sets
 *     (e.g. tapping a ticked-off exercise in a template's Session Plan)
 *
 * Before the extraction, reopening an exercise offered nothing but a blank
 * "log another set" form, so correcting a typo in set 2 meant hunting for it
 * in a different panel.
 *
 * Each row owns its own edit state — rows are independent, and two views of
 * the same set both write through the same owner-scoped PATCH/DELETE.
 *
 * VALIDATION mirrors lib/validators/api.schema.ts exactly. The server is the
 * real gate; these checks exist so the user gets a message next to the field
 * instead of a failed request.
 */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useUpdateSet, useDeleteSet } from "@/lib/hooks/use-workout";

export interface LoggedSet {
  id: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  isWarmup: boolean;
}

/** Highest intensity on the 1-5 scale the logger offers. */
export const MAX_INTENSITY = 5;

interface SetRowProps {
  set: LoggedSet;
  sessionId: string;
  date: string;
  /** Only for the edit button's accessible name. */
  exerciseName: string;
}

interface Draft {
  weight: string;
  reps: string;
  rpe: string;
  isWarmup: boolean;
}

export function SetRow({ set, sessionId, date, exerciseName }: SetRowProps) {
  const updateSet = useUpdateSet(date);
  const deleteSet = useDeleteSet(date);

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    weight: "",
    reps: "",
    rpe: "",
    isWarmup: false,
  });

  function startEdit() {
    setError(null);
    setDraft({
      weight: set.weight != null ? String(set.weight) : "",
      reps: set.reps != null ? String(set.reps) : "",
      rpe: set.rpe != null ? String(set.rpe) : "",
      isWarmup: set.isWarmup,
    });
    setIsEditing(true);
  }

  async function save() {
    const weight = parseFloat(draft.weight);
    if (isNaN(weight) || weight <= 0) {
      setError("Weight must be greater than 0.");
      return;
    }
    const reps = parseInt(draft.reps, 10);
    if (isNaN(reps) || reps <= 0) {
      setError("Reps must be at least 1.");
      return;
    }
    const rpe = draft.rpe.trim() === "" ? null : parseInt(draft.rpe, 10);
    if (rpe !== null && (isNaN(rpe) || rpe < 1 || rpe > MAX_INTENSITY)) {
      setError(`Intensity must be 1–${MAX_INTENSITY} (or empty).`);
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
      setIsEditing(false);
      setError(null);
    } catch {
      setError("Could not save the set. Try again.");
    }
  }

  async function remove() {
    try {
      await deleteSet.mutateAsync({ sessionId, setId: set.id });
      // No setIsEditing(false) needed on success — the row unmounts with the
      // deleted set, and the server renumbers the ones that remain.
    } catch {
      setError("Could not delete the set. Try again.");
    }
  }

  const busy = updateSet.isPending || deleteSet.isPending;

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 pl-7 pr-1">
        <span className="text-xs text-text-muted w-10 shrink-0">
          Set {set.setNumber}
        </span>
        <span className="text-xs text-text-secondary flex-1 truncate">
          {set.weight != null && set.reps != null
            ? `${set.weight}kg × ${set.reps}`
            : `${set.reps ?? "—"} reps`}
          {set.rpe != null ? ` · Intensity ${set.rpe}` : ""}
          {set.isWarmup ? " · warm-up" : ""}
        </span>
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Edit set ${set.setNumber} of ${exerciseName}`}
          className="shrink-0 p-1 text-text-muted hover:text-primary transition-colors"
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-background rounded-lg border border-border p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.weight}
          onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
          placeholder="kg"
          aria-label="Weight (kg)"
          className="w-16 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
        />
        <span className="text-xs text-text-muted">kg ×</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={draft.reps}
          onChange={(e) => setDraft((d) => ({ ...d, reps: e.target.value }))}
          placeholder="reps"
          aria-label="Reps"
          className="w-14 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INTENSITY}
          value={draft.rpe}
          onChange={(e) => setDraft((d) => ({ ...d, rpe: e.target.value }))}
          placeholder={`1-${MAX_INTENSITY}`}
          aria-label={`Intensity (1-${MAX_INTENSITY}, optional)`}
          className="w-14 p-1.5 bg-surface border border-border rounded-md text-sm text-text-primary text-center focus:border-primary focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-text-muted ml-auto">
          <input
            type="checkbox"
            checked={draft.isWarmup}
            onChange={(e) =>
              setDraft((d) => ({ ...d, isWarmup: e.target.checked }))
            }
            className="accent-primary"
          />
          warm-up
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {updateSet.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false);
            setError(null);
          }}
          disabled={busy}
          className="text-xs text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-auto text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deleteSet.isPending ? "Deleting..." : "Delete set"}
        </button>
      </div>
    </div>
  );
}
