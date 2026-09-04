/**
 * Workout Service — Business Logic Layer
 * ═══════════════════════════════════════
 *
 * FLOW FOR LOGGING A WORKOUT:
 * ───────────────────────────
 * 1. User starts a session (LIVE or RECALL mode)
 * 2. User adds sets one by one
 * 3. User finishes the session
 * 4. This service calculates total calorie burn using the engine
 * 5. Repository saves the session with calorie estimates
 *
 * CRITICAL RULE (from Step 2 audit):
 * ──────────────────────────────────
 * The calorie burn calculated here is stored for INFORMATION ONLY.
 * It is displayed on the dashboard as "You burned ~X kcal"
 * but is NEVER added to the user's daily calorie budget.
 * The TDEE already includes gym activity via the activity multiplier.
 * Adding workout calories on top would double-count the gym.
 */

import {
  calculateStrengthBurnSimple,
  calculateCardioBurn,
} from "@/lib/engine";
import {
  createSession,
  getSessionsByDate,
  addSet,
  updateSetForUser,
  deleteSetForUser,
  finishActiveSessionForUser,
  cancelActiveSessionForUser,
  getWorkoutBurnByDate,
  deleteSession,
  reapStaleSessions,
  getUnfinishedSessionsForUser,
} from "@/lib/repositories/workout.repository";
import { NotFoundError } from "@/lib/utils/errors";

/**
 * Default stale-session timeout. No product owner has approved a value; 24h
 * is chosen so there is no legitimate 24-hour gap in activity inside a live
 * workout. One line to change. Intentionally different from the migration
 * backfill threshold (7 days) — see F1 migration comments.
 */
export const STALE_SESSION_TIMEOUT_HOURS = 24;

/**
 * Start a new workout session.
 *
 * Reaps this user's stale IN_PROGRESS sessions first. Cleanup is best-effort:
 * a reaper failure is logged and the session is still created — cleanup must
 * never fail the user's primary action.
 */
export async function startSession(
  userId: string,
  data: {
    date: string;
    mode: "LIVE" | "RECALL";
    splitType?: "PPL" | "UPPER_LOWER" | "BRO" | "FULL_BODY" | "CUSTOM";
  }
) {
  try {
    await reapStaleSessions(userId, STALE_SESSION_TIMEOUT_HOURS);
  } catch (err) {
    console.warn(
      "[startSession] reapStaleSessions failed; creating session anyway:",
      err
    );
  }
  return createSession(userId, data);
}

/**
 * Add a set to an active session.
 *
 * Ownership + IN_PROGRESS status are enforced inside addSet via
 * lockActiveSessionForUser (single locked check). setNumber from the client
 * is advisory — the server derives max+1 under the lock.
 */
export async function logSet(
  sessionId: string,
  userId: string,
  data: {
    exerciseId: string;
    setNumber: number;
    weight?: number;
    reps?: number;
    rpe?: number;
    isWarmup?: boolean;
    clientRequestId?: string;
  }
) {
  // setNumber is accepted for deploy skew (old clients still send it) but
  // ignored for the write — server derives the authoritative value.
  const { setNumber: _advisorySetNumber, ...setData } = data;
  void _advisorySetNumber;
  return addSet(sessionId, userId, setData);
}

/**
 * Edit one logged set (weight/reps/rpe/warmup) in an ACTIVE session.
 * Ownership + in-progress status are enforced in a single locked transaction
 * (see updateSetForUser) — zero rows updated means "not yours, doesn't exist,
 * or already completed", all answered as Not found.
 */
export async function editSet(
  sessionId: string,
  userId: string,
  setId: string,
  data: {
    weight?: number;
    reps?: number;
    rpe?: number | null;
    isWarmup?: boolean;
  }
) {
  const updated = await updateSetForUser(setId, sessionId, userId, data);
  if (!updated) throw new NotFoundError("Set not found");
  return { updated: true };
}

/**
 * Remove one logged set from an ACTIVE session (same scoping as editSet).
 */
export async function removeSet(
  sessionId: string,
  userId: string,
  setId: string
) {
  const deleted = await deleteSetForUser(setId, sessionId, userId);
  if (!deleted) throw new NotFoundError("Set not found");
  return { deleted: true };
}

/**
 * Finish a workout session — calculates total calorie burn under the session
 * lock so a concurrent set log cannot change which exercises contribute or
 * land a set into a session being completed.
 *
 * Uses the engine to estimate calories burned across all sets:
 * - Strength exercises → calculateStrengthBurn() from strength.ts
 * - Cardio exercises → calculateCardioBurn() from cardio.ts
 *
 * Returns a RANGE (low–high) to be honest about uncertainty.
 */
export async function finishSession(
  sessionId: string,
  userId: string,
  data: {
    durationMin: number;
    rpe?: number;
    userWeightKg: number;
    notes?: string;
  }
) {
  const session = await finishActiveSessionForUser(
    sessionId,
    userId,
    (sets) => {
      let totalBurnLow = 0;
      let totalBurnHigh = 0;

      const hasCardio = sets.some((s) => s.exercise.category === "CARDIO");
      const hasStrength = sets.some((s) => s.exercise.category !== "CARDIO");

      if (hasStrength) {
        // Use the simple estimator (duration + RPE based, since we don't
        // know exact sets-per-exercise in this simplified flow)
        const strengthDuration = hasCardio
          ? data.durationMin * 0.7
          : data.durationMin;
        const strengthResult = calculateStrengthBurnSimple(
          strengthDuration, // durationMin (positional arg 1)
          data.userWeightKg, // weightKg (positional arg 2)
          data.rpe ?? 7 // rpe (positional arg 3)
        );
        totalBurnLow += strengthResult.low;
        totalBurnHigh += strengthResult.high;
      }

      if (hasCardio) {
        // Find first cardio exercise to get MET value
        const cardioSet = sets.find((s) => s.exercise.category === "CARDIO");
        if (cardioSet) {
          const cardioDuration = hasStrength
            ? data.durationMin * 0.3
            : data.durationMin;
          const cardioResult = calculateCardioBurn(
            cardioSet.exercise.metValue, // metValue (positional arg 1)
            data.userWeightKg, // weightKg (positional arg 2)
            cardioDuration // durationMin (positional arg 3)
          );
          totalBurnLow += cardioResult.low;
          totalBurnHigh += cardioResult.high;
        }
      }

      return {
        durationMin: data.durationMin,
        rpe: data.rpe,
        caloriesBurnedLow: Math.round(totalBurnLow),
        caloriesBurnedHigh: Math.round(totalBurnHigh),
        notes: data.notes,
      };
    }
  );

  if (!session) throw new NotFoundError("Session not found");
  return session;
}

/**
 * Get sessions for a date (for the workout page).
 */
export async function getWorkoutsByDate(userId: string, date: string) {
  return getSessionsByDate(userId, date);
}

/**
 * Get workout burn summary for a date (for the dashboard info card).
 */
export async function getWorkoutSummary(userId: string, date: string) {
  return getWorkoutBurnByDate(userId, date);
}

/**
 * Delete a workout session.
 */
export async function removeSession(sessionId: string, userId: string) {
  return deleteSession(sessionId, userId);
}

/**
 * Discard an active workout the user explicitly chose to throw away.
 *
 * Soft-cancels (status = CANCELLED) rather than deleting: the logged sets stay
 * in the database so a mis-tap is recoverable, while getSessionsByDate hides
 * CANCELLED so it leaves the UI as the user expects.
 *
 * Without this the "Discard workout" button only cleared local React state —
 * the row stayed IN_PROGRESS forever, which is one of the ways sessions got
 * stuck in the first place.
 */
export async function discardSession(sessionId: string, userId: string) {
  const cancelled = await cancelActiveSessionForUser(sessionId, userId);
  if (!cancelled) throw new NotFoundError("Session not found");
  return { cancelled: true };
}

/**
 * Unfinished workouts (any date) so they can be resumed or closed out.
 * Not date-scoped on purpose — see getUnfinishedSessionsForUser.
 */
export async function getUnfinishedWorkouts(userId: string) {
  return getUnfinishedSessionsForUser(userId);
}
