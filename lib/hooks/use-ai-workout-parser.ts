/**
 * AI Workout Parser Hooks — Client-Side Mutations
 * ════════════════════════════════════════════════
 *
 * TWO STEPS, TWO MUTATIONS — deliberately:
 *
 *   useParseWorkout()   POST /api/ai/parse-workout  → a draft, saves NOTHING
 *   useImportWorkout()  POST /api/workout/ai-import → writes, no AI involved
 *
 * The gap between them is the review screen. It exists because a misread
 * workout is ten to twenty rows the user can only delete while the session is
 * still in progress — and because an unmatched exercise has nowhere to go
 * (there is no custom-exercise table), so it needs a human decision anyway.
 *
 * CACHE INVALIDATION:
 * ───────────────────
 * The import invalidates exactly what useFinishSession invalidates:
 *   ["workout","sessions",date] → the day's sets and the session card
 *   ["workout","unfinished"]    → the cross-date unfinished list
 *   ["progress"]                → Recent Workouts on the progress page
 * The dashboard's workout card is not in that list because it is not wired to
 * a query — it renders with sessionCount={0} hardcoded.
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkoutDraft } from "@/lib/services/ai-workout.service";

export interface ImportSetInput {
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  isWarmup: boolean;
  /** One per set, generated once per draft so retries stay idempotent. */
  clientRequestId: string;
}

export interface ImportWorkoutInput {
  importId: string;
  date: string;
  finish: boolean;
  durationMin?: number;
  notes?: string;
  exercises: Array<{
    exerciseId: string;
    sets: ImportSetInput[];
  }>;
}

export interface ImportWorkoutResult {
  sessionId: string;
  createdSession: boolean;
  setsAdded: number;
  finished: boolean;
  /** True when this import had already been written by an earlier attempt. */
  replayed: boolean;
}

/**
 * Send a paragraph to the parser. Read-only on the server: retrying is safe
 * apart from spending one of the day's ten AI parses.
 */
export function useParseWorkout() {
  return useMutation({
    mutationFn: async (text: string): Promise<WorkoutDraft> => {
      const res = await fetch("/api/ai/parse-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not read that workout");
      }
      return data;
    },
  });
}

/**
 * The server's 409: part of this draft was already saved by an earlier attempt.
 *
 * A distinct type so the caller can recover without reading message text: the
 * draft keeps its per-set keys (which is what detects real replays) and gets a
 * NEW import id, so once the user removes the already-saved exercises the rest
 * can go through instead of colliding with the old import's stamp forever.
 */
export class ImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportConflictError";
  }
}

/** Commit a reviewed draft. Ids and numbers only — no text, no AI. */
export function useImportWorkout(date: string) {
  const queryClient = useQueryClient();

  const refreshWorkouts = () => {
    queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
    queryClient.invalidateQueries({ queryKey: ["workout", "unfinished"] });
  };

  return useMutation({
    mutationFn: async (
      input: ImportWorkoutInput
    ): Promise<ImportWorkoutResult> => {
      const res = await fetch("/api/workout/ai-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = await res.json();
      if (res.status === 409) {
        throw new ImportConflictError(
          data.error || "Some of this workout was already saved."
        );
      }
      if (!res.ok) {
        throw new Error(data.error || "Could not save this workout");
      }
      return data;
    },
    onSuccess: () => {
      refreshWorkouts();
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
    onError: (error) => {
      // A conflict means sets ARE in the database that the page may not be
      // showing yet. Refresh so "you can see it in your workout list" is true.
      if (error instanceof ImportConflictError) refreshWorkouts();
    },
  });
}
