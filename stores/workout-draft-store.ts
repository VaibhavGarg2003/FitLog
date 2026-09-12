/**
 * Workout Draft Store (Zustand + localStorage)
 * ═════════════════════════════════════════════
 *
 * WHAT PROBLEM THIS SOLVES:
 * ─────────────────────────
 * The AI parse returns a draft that lives in browser memory until the user
 * confirms it. Closing the app loses the draft AND one of the day's ten AI
 * parses, and the user has to retype the whole paragraph. Mirroring it to
 * localStorage makes "I got interrupted" free to recover from.
 *
 * ONE SLOT, NOT A HISTORY:
 * ────────────────────────
 * A draft exists only between parsing and confirming — seconds, normally.
 * Confirm or discard clears it; a new parse overwrites it. There is never a
 * pile of drafts to manage, and nothing accumulates over weeks.
 *
 * WHY IT EXPIRES AFTER A DAY:
 * ───────────────────────────
 * The draft carries the date it belongs to. A draft abandoned on Monday and
 * resumed on Thursday would otherwise offer to log Monday's workout onto
 * Thursday. A day is long enough for "after dinner", short enough to be safe.
 *
 * WHY userId:
 * ───────────
 * localStorage is per BROWSER, not per account. On a shared phone, one
 * person's draft must never appear in another's session, so a mismatched owner
 * is discarded on read (same rule as the onboarding store).
 *
 * WHY skipHydration:
 * ──────────────────
 * Reading localStorage is synchronous, so the store would restore before React
 * hydrates and the server HTML would disagree with the client. The component
 * calls rehydrate() in an effect and waits for hasHydrated instead.
 *
 * NOT the database: an unconfirmed draft is not data the user asked us to keep.
 * It stays on the user's own device.
 *
 * HONEST LIMIT OF THE EXPIRY: nothing runs in the background to delete it. The
 * draft is dropped the next time the workout page reads it and finds it older
 * than a day (or owned by someone else). A user who parses a workout, abandons
 * it and never opens the workout page again keeps that paragraph in their
 * browser's storage until they clear site data. It is their own device and
 * their own text, but "expires after 24 hours" means "on next read", not "on a
 * timer", and the difference is worth stating rather than implying.
 */

"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ReviewDraft } from "@/lib/workout/ai-draft";

export const WORKOUT_DRAFT_STORAGE_KEY = "fitlog:workout-draft";

/** A draft older than this is discarded on read. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredDraft {
  /** The date the workout belongs to, "YYYY-MM-DD". */
  date: string;
  /** What the user last typed — kept so a re-parse costs no retyping. */
  text: string;
  /** Import id, generated once so retries of the same draft stay idempotent. */
  importId: string;
  /**
   * The review screen's EDITABLE state — exactly what the user is looking at,
   * with every set's idempotency key embedded.
   *
   * v2 stored the original parse plus a separate key matrix. Two things broke:
   * a resumed draft came back as the ORIGINAL parse, so sets the user had
   * deleted reappeared and exercises they had added vanished; and a retry of
   * an import whose response was lost then sent a different payload from the
   * one that had committed. Storing the edited state closes both — what is
   * recovered is what was being submitted.
   */
  review: ReviewDraft;
  savedAt: number;
  userId: string;
}

interface WorkoutDraftState {
  stored: StoredDraft | null;
  hasHydrated: boolean;

  save: (draft: StoredDraft) => void;
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
  /** The draft if it is fresh and belongs to this user; null otherwise. */
  getUsableDraft: (userId: string) => StoredDraft | null;
}

export const useWorkoutDraftStore = create<WorkoutDraftState>()(
  persist(
    (set, get) => ({
      stored: null,
      hasHydrated: false,

      save: (draft) => set({ stored: draft }),

      clear: () => set({ stored: null }),

      setHasHydrated: (value) => set({ hasHydrated: value }),

      getUsableDraft: (userId) => {
        const stored = get().stored;
        if (!stored) return null;

        const expired = Date.now() - stored.savedAt > DRAFT_MAX_AGE_MS;
        const foreign = stored.userId !== userId;

        if (expired || foreign) {
          // Drop it rather than leave a stale slot behind. Reading is the only
          // moment we know it is unusable.
          set({ stored: null });
          return null;
        }

        return stored;
      },
    }),
    {
      name: WORKOUT_DRAFT_STORAGE_KEY,
      // v3 stores the editable review state (see StoredDraft.review). Older
      // drafts hold only the original parse, so resuming them would restore
      // deleted sets and drop added exercises. Dropping them is right: a draft
      // is seconds of unconfirmed work, and re-parsing costs one AI call.
      version: 3,
      migrate: () => ({ stored: null }),
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ stored: state.stored }),
    }
  )
);
