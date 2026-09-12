"use client";

/**
 * AI Workout Input — log a whole session from one paragraph
 * ══════════════════════════════════════════════════════════
 *
 * THE FLOW:
 * ─────────
 *   type → parse (AI, writes nothing) → review, fix, ADD MORE → import (writes)
 *
 * This component owns the draft and its persistence; AIWorkoutReview owns the
 * editing. The draft lives here, not in the review, because it must survive
 * a reload and grow as the user adds exercises — see lib/workout/ai-draft.ts.
 *
 * THE FLOW IS EXCLUSIVE WHILE OPEN:
 * ─────────────────────────────────
 * `onActiveChange` tells the page when this card is open, and the page hides
 * Start Workout and the templates for that time. They start a SEPARATE, empty
 * session; reaching for one mid-review stranded the draft and left the user
 * with two half-logged workouts. Adding a forgotten exercise now happens inside
 * the review, by AI or by hand.
 *
 * DRAFT RECOVERY:
 * ───────────────
 * The editable draft is mirrored to localStorage on every change (see
 * stores/workout-draft-store.ts) and offered back for 24 hours — exactly as it
 * was on screen, edits and additions included.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ImportConflictError,
  useImportWorkout,
  useParseWorkout,
  type ImportWorkoutResult,
} from "@/lib/hooks/use-ai-workout-parser";
import {
  useWorkoutDraftStore,
  type StoredDraft,
} from "@/stores/workout-draft-store";
import { reviewFromParse, type ReviewDraft } from "@/lib/workout/ai-draft";
import { AIWorkoutReview } from "./ai-workout-review";

interface AIWorkoutInputProps {
  date: string;
  /** Owner of any saved draft — a shared browser must not leak one. */
  userId: string | null;
  onImported: (result: ImportWorkoutResult) => void;
  /** True while the card is open, so the page can hide competing entry points. */
  onActiveChange?: (active: boolean) => void;
}

const PLACEHOLDER =
  "Bench press 4 sets - 40x12, 50x10, 55x8, 55x8. Incline db press 3x12 with 15kg. Push-ups 3x15. 55 minutes.";

export function AIWorkoutInput({
  date,
  userId,
  onImported,
  onActiveChange,
}: AIWorkoutInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  // Synchronous double-submit guard for the import mutation below.
  const inFlightRef = useRef(false);

  const parse = useParseWorkout();
  const importWorkout = useImportWorkout(date);

  const hasHydrated = useWorkoutDraftStore((s) => s.hasHydrated);
  const stored = useWorkoutDraftStore((s) => s.stored);
  const saveDraft = useWorkoutDraftStore((s) => s.save);
  const clearDraft = useWorkoutDraftStore((s) => s.clear);

  // localStorage is read in an effect, not during render: reading it
  // synchronously would restore state the server-rendered HTML does not have,
  // and React would report a hydration mismatch. Mirrors the onboarding
  // wizard, including finishing even if the read threw — a storage failure
  // should degrade to "no saved draft", never to a stuck screen.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    Promise.resolve(useWorkoutDraftStore.persist.rehydrate()).finally(() => {
      if (cancelled) return;
      // Drops a draft that has expired or belongs to another account. Reading
      // is the only moment we can know, so the prune lives here.
      useWorkoutDraftStore.getState().getUsableDraft(userId);
      useWorkoutDraftStore.getState().setHasHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Derived, not stored: a saved draft is offered back only when it belongs to
  // this user and to the date on screen — a Monday draft must never be
  // importable onto Thursday. Age is applied by the prune in the effect above;
  // reading the clock during render would be impure.
  const recoverable: StoredDraft | null = useMemo(() => {
    if (!hasHydrated || !userId || review || !stored) return null;
    if (stored.userId !== userId) return null;
    if (stored.date !== date) return null;
    return stored;
  }, [hasHydrated, userId, review, stored, date]);

  // The page remounts this card when the date changes (a review belongs to the
  // date it was started on). A card that unmounts while open must release the
  // page, or Start Workout would stay hidden with no card on screen to explain
  // why. setState from useState is stable, so this runs on unmount only.
  useEffect(() => {
    return () => onActiveChange?.(false);
  }, [onActiveChange]);

  /** Open or close the card, and tell the page — at the event, not in an effect. */
  function setOpen(open: boolean) {
    setIsOpen(open);
    onActiveChange?.(open);
  }

  /** Update the draft on screen AND the recoverable copy in one step. */
  function commitReview(next: ReviewDraft, id: string, typed: string) {
    setReview(next);
    if (userId) {
      saveDraft({
        date,
        text: typed,
        importId: id,
        review: next,
        savedAt: Date.now(),
        userId,
      });
    }
  }

  function handleParse() {
    const trimmed = text.trim();
    if (trimmed.length < 3 || parse.isPending) return;

    parse.mutate(trimmed, {
      onSuccess: (result) => {
        // The import id is minted once per draft, and every set's key is minted
        // inside reviewFromParse. Both are persisted from here on, so a resumed
        // draft sends exactly what the first attempt sent.
        const id = crypto.randomUUID();
        setImportId(id);
        commitReview(reviewFromParse(result), id, trimmed);
      },
    });
  }

  function resumeDraft(saved: StoredDraft) {
    setText(saved.text);
    setImportId(saved.importId);
    setReview(saved.review);
    setOpen(true);
  }

  function discardDraft() {
    clearDraft();
    setReview(null);
    setImportId(null);
    parse.reset();
    importWorkout.reset();
  }

  function closeCard() {
    discardDraft();
    setText("");
    setOpen(false);
  }

  // ── Collapsed: a single entry point on the workout page ──
  if (!isOpen) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-3.5 bg-surface border border-border rounded-2xl text-text-primary font-semibold hover:border-primary/50 transition-colors"
        >
          ✨ Log workout with AI
        </button>

        {recoverable && (
          <div className="flex flex-wrap items-center gap-3 bg-surface border border-amber-500/30 rounded-xl px-4 py-3">
            <span className="text-sm text-text-secondary">
              Unsaved draft · {recoverable.review.exercises.length} exercises,{" "}
              {recoverable.review.exercises.reduce(
                (sum, exercise) => sum + exercise.sets.length,
                0
              )}{" "}
              sets
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() => resumeDraft(recoverable)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Review
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Review: the draft is on screen, nothing is saved yet ──
  if (review && importId) {
    return (
      <AIWorkoutReview
        review={review}
        onChange={(next) => commitReview(next, importId, text.trim())}
        importId={importId}
        date={date}
        isImporting={importWorkout.isPending}
        error={
          importWorkout.isError
            ? importWorkout.error instanceof Error
              ? importWorkout.error.message
              : "Could not save this workout"
            : null
        }
        onCancel={closeCard}
        onImport={(input) => {
          // The guard lives HERE, next to the mutation, and is a ref so it
          // closes synchronously. `isImporting` only reaches the review screen
          // on the next render, so two fast taps could otherwise both dispatch.
          if (inFlightRef.current) return;
          inFlightRef.current = true;

          importWorkout.mutate(input, {
            // Cleared however the request ends, so a genuine retry is allowed
            // and a stuck flag can never wedge the button.
            onSettled: () => {
              inFlightRef.current = false;
            },
            onError: (error) => {
              // Part of this draft was saved by an earlier attempt. Keep every
              // set's key (that is what detects a genuine replay) but mint a
              // new import id. Without it, once the user removes the saved
              // exercises and retries, the leftover exercises would collide
              // with the OLD import's stamp and could never be added.
              //
              // Only on a 409. The server serializes attempts with an advisory
              // lock keyed on the import id; after "already being saved" (the
              // first attempt still running) a NEW id would take a different
              // lock and write alongside it. Replays themselves never depended
              // on the id — the per-set keys decide those.
              if (error instanceof ImportConflictError) {
                const freshId = crypto.randomUUID();
                setImportId(freshId);
                commitReview(review, freshId, text.trim());
              }
            },
            onSuccess: (result) => {
              clearDraft();
              setReview(null);
              setImportId(null);
              setText("");
              setOpen(false);
              onImported(result);
            },
          });
        }}
      />
    );
  }

  // ── Typing ──
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-text-primary">
          ✨ Log workout with AI
        </h3>
        <button
          type="button"
          onClick={closeCard}
          className="text-text-muted hover:text-text-secondary text-sm"
        >
          ✕
        </button>
      </div>

      <textarea
        id="ai-workout-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={4}
        maxLength={1500}
        disabled={parse.isPending}
        className="w-full bg-background border border-border rounded-xl p-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-text-muted">
          Type it however you say it — English or Hinglish. You review before
          anything is saved, and can add more exercises there.
        </p>
        <button
          type="button"
          onClick={handleParse}
          disabled={text.trim().length < 3 || parse.isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors shrink-0"
        >
          {parse.isPending ? "Reading..." : "Read my workout"}
        </button>
      </div>

      {parse.isPending && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 bg-gradient-to-r from-surface via-border/50 to-surface rounded-lg animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}

      {parse.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-sm text-red-400">
            {parse.error instanceof Error
              ? parse.error.message
              : "Could not read that workout"}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Close this card to log it by hand with Start Workout instead.
          </p>
        </div>
      )}
    </div>
  );
}
