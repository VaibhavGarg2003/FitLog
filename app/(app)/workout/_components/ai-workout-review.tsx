"use client";

/**
 * AI Workout Review — confirm before anything is written
 * ═══════════════════════════════════════════════════════
 *
 * WHY THIS SCREEN EXISTS:
 * ───────────────────────
 * The nutrition AI writes the moment the model answers. A workout cannot: one
 * misread paragraph is ten to twenty rows, they can only be edited while the
 * session is IN_PROGRESS, and an exercise the matcher could not resolve has
 * nowhere to go (there is no custom-exercise table). So the draft is shown,
 * corrected here, and only then imported.
 *
 * WHAT THE USER CAN DO HERE:
 * ──────────────────────────
 * - change a weight or rep count, add or delete a set, remove an exercise
 * - pick the right exercise when the matcher was unsure or gave up
 * - ADD MORE EXERCISES, either by describing them to the AI again or by
 *   picking them from the catalog — both append to this same draft
 * - decide whether the session should also be finished
 *
 * WHY "ADD MORE" LIVES HERE AND NOT BEHIND "START WORKOUT":
 * ─────────────────────────────────────────────────────────
 * Start Workout opens a separate, empty session. Reaching for it mid-review to
 * add a forgotten exercise used to strand the draft: the manual screen knows
 * nothing about it, and the user ends up with two half-logged workouts. The
 * page now hides Start Workout while this flow is open, and this screen is the
 * one place a workout gets assembled — however it was described.
 *
 * CONTROLLED COMPONENT: the draft lives in the parent and is persisted on every
 * change (see lib/workout/ai-draft.ts), so a recovered draft is exactly what
 * was on screen, additions and deletions included.
 */

import { useState } from "react";
import { useParseWorkout } from "@/lib/hooks/use-ai-workout-parser";
import type { ImportWorkoutInput } from "@/lib/hooks/use-ai-workout-parser";
import {
  draftTotals,
  importBlocker,
  manualExercise,
  mergeParse,
  remainingCapacity,
  toImportPayload,
  MAX_SETS_PER_EXERCISE,
  type EditableSet,
  type ReviewDraft,
} from "@/lib/workout/ai-draft";
import { ExerciseBrowser } from "./exercise-browser";
import { cn } from "@/lib/utils/cn";

/** Sentinel for the exercise browser: append a new line rather than re-match one. */
const NEW_LINE = "__new__";

interface AIWorkoutReviewProps {
  review: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  /** Stable across retries of the same draft — see the store. */
  importId: string;
  date: string;
  isImporting: boolean;
  error?: string | null;
  onCancel: () => void;
  onImport: (input: ImportWorkoutInput) => void;
}

export function AIWorkoutReview({
  review,
  onChange,
  importId,
  date,
  isImporting,
  error,
  onCancel,
  onImport,
}: AIWorkoutReviewProps) {
  const [finish, setFinish] = useState(false);
  const [duration, setDuration] = useState(
    review.durationMin != null ? String(review.durationMin) : ""
  );
  // The AI's note is shown and can be dropped — nothing is written that the
  // user did not see. It is only sent when finishing (the only path storing it).
  const [keepNotes, setKeepNotes] = useState(true);
  // Which line the exercise browser is choosing for, or NEW_LINE to append.
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  // "Add more with AI" — its own parse, merged into this draft on success.
  const [addingWithAI, setAddingWithAI] = useState(false);
  const [addText, setAddText] = useState("");
  const addParse = useParseWorkout();

  const totals = draftTotals(review);
  const capacity = remainingCapacity(review);
  const blocker = importBlocker(review, { finish, duration });
  const busy = isImporting || addParse.isPending;

  // ── edits ──────────────────────────────────────────────────────

  function updateExercises(
    map: (exercises: ReviewDraft["exercises"]) => ReviewDraft["exercises"]
  ) {
    onChange({ ...review, exercises: map(review.exercises) });
  }

  function updateSet(
    lineId: string,
    clientRequestId: string,
    changes: Partial<EditableSet>
  ) {
    updateExercises((exercises) =>
      exercises.map((exercise) =>
        exercise.lineId === lineId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.clientRequestId === clientRequestId
                  ? { ...set, ...changes }
                  : set
              ),
            }
          : exercise
      )
    );
  }

  function removeSet(lineId: string, clientRequestId: string) {
    updateExercises((exercises) =>
      exercises
        .map((exercise) =>
          exercise.lineId === lineId
            ? {
                ...exercise,
                sets: exercise.sets.filter(
                  (set) => set.clientRequestId !== clientRequestId
                ),
              }
            : exercise
        )
        // An exercise with no sets left is nothing to import.
        .filter((exercise) => exercise.sets.length > 0)
    );
  }

  function removeExercise(lineId: string) {
    updateExercises((exercises) =>
      exercises.filter((exercise) => exercise.lineId !== lineId)
    );
  }

  /** Copy the last set of an exercise — for a set the parser dropped. */
  function addSet(lineId: string) {
    updateExercises((exercises) =>
      exercises.map((exercise) => {
        if (exercise.lineId !== lineId) return exercise;
        const last = exercise.sets[exercise.sets.length - 1];
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            {
              // New work, so a new key: it existed in no earlier attempt.
              clientRequestId: crypto.randomUUID(),
              weight: last?.weight ?? "",
              reps: last?.reps ?? "",
              rpe: null,
              isWarmup: false,
            },
          ],
        };
      })
    );
  }

  function handlePicked(picked: { id: string; name: string; category: string }) {
    if (pickingFor === NEW_LINE) {
      // Added by hand from the catalog: appended with one empty set to fill in.
      updateExercises((exercises) => [...exercises, manualExercise(picked)]);
    } else if (pickingFor) {
      // Re-matching an existing line the parser was unsure about.
      updateExercises((exercises) =>
        exercises.map((exercise) =>
          exercise.lineId === pickingFor
            ? {
                ...exercise,
                exerciseId: picked.id,
                exerciseName: picked.name,
                category: picked.category,
                needsReview: false,
                isCardio: picked.category === "CARDIO",
                warnings: [],
              }
            : exercise
        )
      );
    }
    setPickingFor(null);
  }

  // ── add more with AI ───────────────────────────────────────────

  function handleAddWithAI() {
    const trimmed = addText.trim();
    if (trimmed.length < 3 || addParse.isPending) return;

    addParse.mutate(trimmed, {
      onSuccess: (incoming) => {
        const merged = mergeParse(review, incoming);
        onChange(merged);
        // A duration from the new paragraph fills the field only if it was
        // still empty — never overwrites what the user already typed.
        if (duration.trim() === "" && merged.durationMin != null) {
          setDuration(String(merged.durationMin));
        }
        setAddText("");
        setAddingWithAI(false);
        addParse.reset();
      },
    });
  }

  // ── import ─────────────────────────────────────────────────────

  function handleImport() {
    if (blocker || busy) return;
    onImport(
      toImportPayload(review, { importId, date, finish, duration, keepNotes })
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-text-primary">Check this first</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {totals.exercises} exercise{totals.exercises === 1 ? "" : "s"} ·{" "}
            {totals.sets} set{totals.sets === 1 ? "" : "s"}
            {totals.unresolved > 0 && (
              <span className="text-amber-400">
                {" "}
                · {totals.unresolved} need{totals.unresolved === 1 ? "s" : ""} an
                exercise
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          Discard
        </button>
      </div>

      {/* Anything any parse removed from the WHOLE draft. Said out loud,
          because a silent omission becomes permanent once the session is
          finished. */}
      {review.warnings.length > 0 && (
        <div className="px-4 pt-3 space-y-1">
          {review.warnings.map((warning, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1"
            >
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="divide-y divide-border">
        {review.exercises.map((exercise) => (
          <div key={exercise.lineId} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {exercise.exerciseName ? (
                  <p className="font-semibold text-text-primary text-sm">
                    {exercise.exerciseName}
                  </p>
                ) : (
                  <p className="font-semibold text-amber-400 text-sm">
                    Couldn&apos;t match &ldquo;{exercise.inputName}&rdquo;
                  </p>
                )}
                <p className="text-[11px] text-text-muted mt-0.5">
                  {exercise.source === "manual"
                    ? "added by hand"
                    : `you wrote: ${exercise.inputName}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setPickingFor(exercise.lineId)}
                  disabled={busy}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {exercise.exerciseId ? "Change" : "Pick exercise"}
                </button>
                <button
                  type="button"
                  onClick={() => removeExercise(exercise.lineId)}
                  disabled={busy}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>

            {exercise.warnings.length > 0 && (
              <ul className="space-y-1">
                {exercise.warnings.map((warning, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2">
              {exercise.sets.map((set, index) => (
                <div
                  key={set.clientRequestId}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs text-text-muted w-12 shrink-0">
                    {set.isWarmup ? "warm" : `Set ${index + 1}`}
                  </span>
                  <input
                    id={`w-${set.clientRequestId}`}
                    type="number"
                    inputMode="decimal"
                    value={set.weight}
                    placeholder="kg"
                    disabled={busy}
                    onChange={(e) =>
                      updateSet(exercise.lineId, set.clientRequestId, {
                        weight: e.target.value,
                      })
                    }
                    className="w-20 p-2 bg-background border border-border rounded-lg text-center text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                  <span className="text-xs text-text-muted">×</span>
                  <input
                    id={`r-${set.clientRequestId}`}
                    type="number"
                    inputMode="numeric"
                    value={set.reps}
                    placeholder="reps"
                    disabled={busy}
                    onChange={(e) =>
                      updateSet(exercise.lineId, set.clientRequestId, {
                        reps: e.target.value,
                      })
                    }
                    className="w-20 p-2 bg-background border border-border rounded-lg text-center text-sm text-text-primary focus:border-primary focus:outline-none"
                  />
                  {/* Intensity is written to the database, so it has to be
                      visible here — and removable, never a hidden value. */}
                  {set.rpe != null && (
                    <button
                      type="button"
                      onClick={() =>
                        updateSet(exercise.lineId, set.clientRequestId, {
                          rpe: null,
                        })
                      }
                      disabled={busy}
                      title="Remove intensity"
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary disabled:opacity-50"
                    >
                      intensity {set.rpe}/5 ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSet(exercise.lineId, set.clientRequestId)}
                    disabled={busy}
                    className="ml-auto text-xs text-text-muted hover:text-red-400 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addSet(exercise.lineId)}
                disabled={
                  busy ||
                  exercise.sets.length >= MAX_SETS_PER_EXERCISE ||
                  capacity.sets === 0
                }
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                + Add set
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Add more exercises — the reason Start Workout is hidden ── */}
      <div className="p-4 border-t border-border space-y-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Add more exercises
        </p>

        {addingWithAI ? (
          <div className="space-y-2">
            <textarea
              id="ai-workout-add-text"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder="Describe what else you did — e.g. cable fly 3x12 at 15kg, plank 3 sets"
              rows={2}
              maxLength={1500}
              disabled={addParse.isPending}
              className="w-full bg-background border border-border rounded-xl p-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddingWithAI(false);
                  setAddText("");
                  addParse.reset();
                }}
                disabled={addParse.isPending}
                className="text-sm text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddWithAI}
                disabled={addText.trim().length < 3 || addParse.isPending}
                className="px-3 py-1.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-primary-hover transition-colors"
              >
                {addParse.isPending ? "Reading..." : "Add to this workout"}
              </button>
            </div>
            {addParse.isError && (
              <p className="text-xs text-red-400">
                {addParse.error instanceof Error
                  ? addParse.error.message
                  : "Could not read that"}{" "}
                — or pick the exercise by hand instead.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAddingWithAI(true)}
              disabled={busy || capacity.exercises === 0}
              className="py-2.5 rounded-xl border border-border text-sm text-text-primary hover:border-primary/50 disabled:opacity-50 transition-colors"
            >
              ✨ Describe with AI
            </button>
            <button
              type="button"
              onClick={() => setPickingFor(NEW_LINE)}
              disabled={busy || capacity.exercises === 0}
              className="py-2.5 rounded-xl border border-border text-sm text-text-primary hover:border-primary/50 disabled:opacity-50 transition-colors"
            >
              + Pick an exercise
            </button>
          </div>
        )}

        {capacity.exercises === 0 && (
          <p className="text-[11px] text-text-muted">
            This import is full. Add this workout first, then log the rest in a
            second one.
          </p>
        )}
      </div>

      <div className="p-4 border-t border-border space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            id="ai-import-finish"
            type="checkbox"
            checked={finish}
            disabled={busy}
            onChange={(e) => setFinish(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-text-secondary">
            Also finish this workout
            <span className="block text-[11px] text-text-muted">
              Calculates calories burned. A finished workout can no longer have
              its sets edited, so leave this off if you are still training.
            </span>
          </span>
        </label>

        {finish && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="ai-import-duration"
              className="text-xs text-text-muted"
            >
              Duration (min)
            </label>
            <input
              id="ai-import-duration"
              type="number"
              inputMode="numeric"
              value={duration}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                setDuration(value);
                // Persist it with the draft too, or a recovered draft forgets
                // the duration the user typed. The local string keeps typing
                // fluid; the draft holds the number.
                const minutes = Number(value);
                onChange({
                  ...review,
                  durationMin:
                    value.trim() !== "" && Number.isFinite(minutes) && minutes > 0
                      ? minutes
                      : null,
                });
              }}
              className="w-24 p-2 bg-background border border-border rounded-lg text-center text-sm text-text-primary focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {finish && review.notes && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              id="ai-import-keep-notes"
              type="checkbox"
              checked={keepNotes}
              disabled={busy}
              onChange={(e) => setKeepNotes(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-text-secondary">
              Save the note:{" "}
              <span className="text-text-primary">
                &ldquo;{review.notes}&rdquo;
              </span>
            </span>
          </label>
        )}

        {/* The same checks the server makes, said before the button is pressed. */}
        {blocker && <p className="text-xs text-amber-400">{blocker}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleImport}
          disabled={blocker !== null || busy}
          className={cn(
            "w-full py-3 rounded-xl font-semibold transition-colors",
            blocker !== null || busy
              ? "bg-surface-elevated text-text-muted cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary-hover"
          )}
        >
          {isImporting
            ? "Adding..."
            : `Add workout · ${totals.sets} set${totals.sets === 1 ? "" : "s"}`}
        </button>
      </div>

      <ExerciseBrowser
        isOpen={pickingFor !== null}
        onClose={() => setPickingFor(null)}
        onSelect={handlePicked}
      />
    </div>
  );
}
