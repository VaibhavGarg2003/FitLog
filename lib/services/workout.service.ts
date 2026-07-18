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
  findSessionForUser,
  addSet,
  updateSetForUser,
  deleteSetForUser,
  completeSession,
  getWorkoutBurnByDate,
  deleteSession,
} from "@/lib/repositories/workout.repository";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";

/**
 * Start a new workout session.
 */
export async function startSession(
  userId: string,
  data: {
    date: string;
    mode: "LIVE" | "RECALL";
    splitType?: "PPL" | "UPPER_LOWER" | "BRO" | "FULL_BODY" | "CUSTOM";
  }
) {
  return createSession(userId, data);
}

/**
 * Add a set to an active session.
 *
 * SECURITY: verifies the session belongs to `userId` before writing.
 * Without this check, any logged-in user could add sets to another
 * user's session just by knowing its id (IDOR). Throws "Not found"
 * (not "Forbidden") so we never reveal that the session exists.
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
  }
) {
  const session = await findSessionForUser(sessionId, userId);
  if (!session) throw new NotFoundError("Session not found");
  if (session.status !== "IN_PROGRESS") {
    throw new ValidationError("Cannot add sets to a completed session");
  }
  return addSet(sessionId, data);
}

/**
 * Edit one logged set (weight/reps/rpe/warmup) in an ACTIVE session.
 * Ownership + in-progress status are enforced in a single owner-scoped
 * query (see updateSetForUser) — zero rows updated means "not yours,
 * doesn't exist, or already completed", all answered as Not found.
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
 * Finish a workout session — calculates total calorie burn.
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
  // Get this session (owner-scoped) to calculate burn.
  // SECURITY + BUG FIX: previously this looked up sessions by the SERVER's
  // current UTC date and searched for a matching id. That (a) let the date
  // mismatch hide a user's own session near midnight, and (b) relied on the
  // date filter for ownership. Fetching directly by (id + userId) fixes both:
  // it's a real ownership check and it doesn't care what day it is.
  const session = await findSessionForUser(sessionId, userId);

  if (!session) throw new NotFoundError("Session not found");

  let totalBurnLow = 0;
  let totalBurnHigh = 0;

  // Count cardio vs strength exercises
  const hasCardio = session.exerciseSets.some(
    (s) => s.exercise.category === "CARDIO"
  );
  const hasStrength = session.exerciseSets.some(
    (s) => s.exercise.category !== "CARDIO"
  );

  if (hasStrength) {
    // Use the simple estimator (duration + RPE based, since we don't
    // know exact sets-per-exercise in this simplified flow)
    const strengthDuration = hasCardio ? data.durationMin * 0.7 : data.durationMin;
    const strengthResult = calculateStrengthBurnSimple(
      strengthDuration,       // durationMin (positional arg 1)
      data.userWeightKg,      // weightKg (positional arg 2)
      data.rpe ?? 7           // rpe (positional arg 3)
    );
    totalBurnLow += strengthResult.low;
    totalBurnHigh += strengthResult.high;
  }

  if (hasCardio) {
    // Find first cardio exercise to get MET value
    const cardioSet = session.exerciseSets.find(
      (s) => s.exercise.category === "CARDIO"
    );
    if (cardioSet) {
      const cardioDuration = hasStrength ? data.durationMin * 0.3 : data.durationMin;
      const cardioResult = calculateCardioBurn(
        cardioSet.exercise.metValue,  // metValue (positional arg 1)
        data.userWeightKg,            // weightKg (positional arg 2)
        cardioDuration                // durationMin (positional arg 3)
      );
      totalBurnLow += cardioResult.low;
      totalBurnHigh += cardioResult.high;
    }
  }

  // Complete the session with calorie burn range
  return completeSession(sessionId, {
    durationMin: data.durationMin,
    rpe: data.rpe,
    caloriesBurnedLow: Math.round(totalBurnLow),
    caloriesBurnedHigh: Math.round(totalBurnHigh),
    notes: data.notes,
  });
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
