/**
 * AI Workout Draft — the editable state of the review screen
 * ═══════════════════════════════════════════════════════════
 *
 * WHAT THIS IS:
 * ─────────────
 * The review screen is where a parsed workout gets corrected before anything
 * is written. This module owns the SHAPE of that editable state and every pure
 * operation on it: building it from a parse, merging a second parse into it,
 * adding an exercise by hand, and turning it into the import payload.
 *
 * WHY IT LIVES OUTSIDE THE COMPONENT:
 * ───────────────────────────────────
 * Two things need this state besides the screen that renders it:
 *
 *   1. "Add more exercises". A workout is not always described in one go —
 *      the user reviews the first paragraph, remembers the cable flys, and
 *      adds them by describing them to the AI again or by picking them. Both
 *      paths append to the SAME draft, so the draft cannot be private to one
 *      render of one component.
 *
 *   2. Draft recovery. What gets persisted to localStorage must be what the
 *      user is actually looking at — edits, deletions and additions included.
 *      Persisting only the original parse meant a resumed draft silently
 *      brought back sets the user had deleted and dropped exercises they had
 *      added, and a retry of an import whose response was lost would then
 *      send a different payload from the one that committed.
 *
 * NO SERVER IMPORTS. Types only from the parser, so this is safe in the
 * browser bundle and trivially unit-testable.
 */

import type { WorkoutDraft } from "@/lib/services/ai-workout.service";

/** Mirrors MAX_TOTAL_SETS in the parser and the import schema's set cap. */
export const MAX_IMPORT_SETS = 40;
/** Mirrors MAX_EXERCISES in the parser and the import schema. */
export const MAX_IMPORT_EXERCISES = 15;
/** Mirrors the per-exercise set cap in the import schema. */
export const MAX_SETS_PER_EXERCISE = 12;

export interface EditableSet {
  /**
   * Idempotency key for this set, minted ONCE when the set first appears and
   * persisted with the draft. A retry must send the same keys as the attempt
   * it is retrying, or the server cannot recognise it as a replay.
   */
  clientRequestId: string;
  /** Strings, because they are bound to inputs and "" is a legitimate state. */
  weight: string;
  reps: string;
  rpe: number | null;
  isWarmup: boolean;
}

export interface EditableExercise {
  /**
   * Client-generated and unique across the whole draft. The parser numbers its
   * lines "line-0", "line-1"… per response, so two merged parses would collide
   * — and every edit is addressed by this id.
   */
  lineId: string;
  /** What the user wrote, or the catalog name when picked by hand. */
  inputName: string;
  exerciseId: string | null;
  exerciseName: string | null;
  category: string | null;
  warnings: string[];
  needsReview: boolean;
  isCardio: boolean;
  /** How the line got here — shown so a hand-picked line is not mistaken for a parse. */
  source: "ai" | "manual";
  sets: EditableSet[];
}

export interface ReviewDraft {
  exercises: EditableExercise[];
  /** Draft-level warnings from every parse that contributed. */
  warnings: string[];
  notes: string | null;
  durationMin: number | null;
}

/** Turn the parser's lines into editable exercises with fresh keys. */
export function exercisesFromParse(draft: WorkoutDraft): EditableExercise[] {
  return draft.exercises.map((exercise) => ({
    lineId: crypto.randomUUID(),
    inputName: exercise.inputName,
    exerciseId: exercise.exercise?.id ?? null,
    exerciseName: exercise.exercise?.name ?? null,
    category: exercise.exercise?.category ?? null,
    warnings: exercise.warnings,
    needsReview: exercise.needsReview,
    isCardio: exercise.isCardio,
    source: "ai",
    sets: exercise.sets.map((set) => ({
      clientRequestId: crypto.randomUUID(),
      weight: set.weight != null ? String(set.weight) : "",
      reps: set.reps != null ? String(set.reps) : "",
      rpe: set.rpe,
      isWarmup: set.isWarmup,
    })),
  }));
}

/** A brand-new review draft from the first parse. */
export function reviewFromParse(draft: WorkoutDraft): ReviewDraft {
  return {
    exercises: exercisesFromParse(draft),
    warnings: [...draft.warnings],
    notes: draft.notes,
    durationMin: draft.durationMin,
  };
}

/**
 * Append a SECOND parse to an existing draft.
 *
 * Appends rather than replaces: the user asked for "more", and everything
 * already on screen may have been corrected by hand. A duration or note from
 * the new paragraph fills a gap but never overwrites what is already there.
 */
export function mergeParse(
  current: ReviewDraft,
  incoming: WorkoutDraft
): ReviewDraft {
  return {
    exercises: [...current.exercises, ...exercisesFromParse(incoming)],
    warnings: [...current.warnings, ...incoming.warnings],
    notes: current.notes ?? incoming.notes,
    durationMin: current.durationMin ?? incoming.durationMin,
  };
}

/**
 * An exercise the user picked from the catalog by hand.
 *
 * Starts with ONE empty set rather than none: an exercise with no sets would
 * be silently dropped from the import, and an empty set is exactly what the
 * review screen already knows how to ask the user to fill in.
 */
export function manualExercise(picked: {
  id: string;
  name: string;
  category: string;
}): EditableExercise {
  return {
    lineId: crypto.randomUUID(),
    inputName: picked.name,
    exerciseId: picked.id,
    exerciseName: picked.name,
    category: picked.category,
    warnings: [],
    needsReview: false,
    isCardio: picked.category === "CARDIO",
    source: "manual",
    sets: [
      {
        clientRequestId: crypto.randomUUID(),
        weight: "",
        reps: "",
        rpe: null,
        isWarmup: false,
      },
    ],
  };
}

export interface DraftTotals {
  exercises: number;
  sets: number;
  /** Lines with no catalog exercise chosen yet. */
  unresolved: number;
  /** Sets with neither a weight nor a rep count. */
  emptySets: number;
}

export function draftTotals(review: ReviewDraft): DraftTotals {
  let sets = 0;
  let emptySets = 0;
  let unresolved = 0;

  for (const exercise of review.exercises) {
    sets += exercise.sets.length;
    if (exercise.exerciseId === null) unresolved++;
    for (const set of exercise.sets) {
      if (set.weight.trim() === "" && set.reps.trim() === "") emptySets++;
    }
  }

  return { exercises: review.exercises.length, sets, unresolved, emptySets };
}

/** How many more sets and exercises this draft can still take. */
export function remainingCapacity(review: ReviewDraft): {
  sets: number;
  exercises: number;
} {
  const totals = draftTotals(review);
  return {
    sets: Math.max(0, MAX_IMPORT_SETS - totals.sets),
    exercises: Math.max(0, MAX_IMPORT_EXERCISES - totals.exercises),
  };
}

/**
 * Why the draft cannot be imported yet, as something to show the user —
 * or null when it is ready. Mirrors every check aiImportSchema makes, so a
 * user never meets a generic 400 after pressing the button.
 */
export function importBlocker(
  review: ReviewDraft,
  options: { finish: boolean; duration: string }
): string | null {
  const totals = draftTotals(review);

  if (totals.exercises === 0 || totals.sets === 0) {
    return "Add at least one exercise with a set.";
  }
  if (totals.unresolved > 0) {
    return `${totals.unresolved} exercise${totals.unresolved === 1 ? " needs" : "s need"} to be picked.`;
  }
  if (totals.emptySets > 0) {
    return `${totals.emptySets} set${totals.emptySets === 1 ? "" : "s"} still need a weight or reps.`;
  }
  if (totals.exercises > MAX_IMPORT_EXERCISES) {
    return `One import can take ${MAX_IMPORT_EXERCISES} exercises — remove ${totals.exercises - MAX_IMPORT_EXERCISES}.`;
  }
  if (totals.sets > MAX_IMPORT_SETS) {
    return `One import can take ${MAX_IMPORT_SETS} sets — remove ${totals.sets - MAX_IMPORT_SETS}.`;
  }
  if (options.finish && options.duration.trim() === "") {
    return "Add the workout duration to finish it.";
  }
  return null;
}

/** Build the import request from exactly what is on screen. */
export function toImportPayload(
  review: ReviewDraft,
  options: {
    importId: string;
    date: string;
    finish: boolean;
    duration: string;
    keepNotes: boolean;
  }
) {
  return {
    importId: options.importId,
    date: options.date,
    finish: options.finish,
    durationMin:
      options.duration.trim() !== "" ? Number(options.duration) : undefined,
    // Only sent when finishing: notes are written as part of completing the
    // session, so sending them otherwise would be a promise nothing keeps.
    notes:
      options.finish && options.keepNotes
        ? review.notes ?? undefined
        : undefined,
    exercises: review.exercises
      .filter((exercise) => exercise.exerciseId !== null)
      .map((exercise) => ({
        exerciseId: exercise.exerciseId as string,
        sets: exercise.sets.map((set) => ({
          weight: set.weight.trim() !== "" ? Number(set.weight) : null,
          reps: set.reps.trim() !== "" ? Number(set.reps) : null,
          rpe: set.rpe,
          isWarmup: set.isWarmup,
          clientRequestId: set.clientRequestId,
        })),
      })),
  };
}
