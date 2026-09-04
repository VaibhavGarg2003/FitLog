/**
 * Workout Repository — Raw Prisma Queries
 * ════════════════════════════════════════
 *
 * TABLES USED:
 * ────────────
 * WorkoutSession — one per gym visit
 * ExerciseSet    — individual sets within a session
 * Exercise       — reference table (seeded in Step 2)
 *
 * IMPORTANT RULE (from Step 2 audit):
 * ────────────────────────────────────
 * Workout calorie burns stored here are for INFORMATION ONLY.
 * They must NEVER be added to the user's daily calorie budget.
 * The TDEE already includes gym activity via the activity multiplier.
 *
 * SERIALIZATION BOUNDARY (F2):
 * ────────────────────────────
 * Every session-scoped mutation (add/update/delete set, finish) takes the
 * same row lock first: `SELECT id FROM workout_sessions WHERE id AND user_id
 * AND status = 'IN_PROGRESS' FOR UPDATE`. Ownership, existence and status
 * collapse into one locked check. Null ⇒ NotFoundError (IDOR-safe: never
 * "forbidden"). The reaper uses the same lock so it serializes cleanly with
 * mutations under READ COMMITTED.
 *
 * ACTIVITY TIMESTAMP:
 * ───────────────────
 * `workout_sessions.updated_at` is the authoritative activity signal. Every
 * set create/update/delete touches the parent inside the same transaction.
 * We use raw `UPDATE ... SET updated_at = now()` rather than Prisma
 * `data: { updatedAt: new Date() }` on an `@updatedAt` field — Prisma may
 * silently ignore an explicit write to `@updatedAt`, and a silent no-op
 * would leave the reaper free to cancel an actively-edited session.
 *
 * ADD-SET IDEMPOTENCY + RETRY (F1):
 * ─────────────────────────────────
 * The P2002 retry loop lives OUTSIDE the transaction. A unique violation
 * aborts the Postgres transaction (`25P02` on every subsequent statement),
 * so catching P2002 and re-querying inside the same callback is dead code.
 * Each attempt opens a fresh `$transaction` and re-reads cleanly.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import { NotFoundError } from "@/lib/utils/errors";

/** Transaction client shape used by lock/touch helpers and mutation bodies. */
type Tx = Prisma.TransactionClient;

const ADD_SET_MAX_ATTEMPTS = 3;

/**
 * Lock an IN_PROGRESS session owned by `userId`. Returns null when no row
 * matches (missing, wrong owner, or not in progress) — callers map null to
 * NotFoundError so we never reveal that another user's session exists.
 *
 * Must be the FIRST statement inside every session-scoped mutation transaction.
 *
 * Call shape settled for PrismaPg adapter:
 *   tx.$queryRaw<{ id: string }[]>`SELECT id FROM workout_sessions
 *     WHERE id = ${sessionId} AND user_id = ${userId}
 *       AND status = 'IN_PROGRESS' FOR UPDATE`
 * Tagged-template `$queryRaw` (not `$queryRawUnsafe`) so parameters are bound;
 * run inside `prisma.$transaction(async (tx) => { ... })`.
 */
export async function lockActiveSessionForUser(
  tx: Tx,
  sessionId: string,
  userId: string
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM workout_sessions
    WHERE id = ${sessionId}
      AND user_id = ${userId}
      AND status = 'IN_PROGRESS'
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Lock any session owned by `userId`, regardless of status.
 *
 * Used by deleteSession: deleting a COMPLETED session is legitimate, so we
 * cannot reuse lockActiveSessionForUser (which filters IN_PROGRESS). Still
 * owner-scoped FOR UPDATE so a concurrent set log serializes with the
 * cascade delete instead of being silently discarded between a separate
 * ownership check and the DELETE.
 */
async function lockSessionForUser(
  tx: Tx,
  sessionId: string,
  userId: string
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM workout_sessions
    WHERE id = ${sessionId}
      AND user_id = ${userId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Bump the parent session's activity timestamp inside the same transaction
 * as a set mutation. Raw SQL — see file header for why not Prisma @updatedAt.
 */
async function touchSessionActivity(tx: Tx, sessionId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE workout_sessions SET updated_at = now() WHERE id = ${sessionId}
  `;
}

/**
 * Create a new workout session (start of gym visit).
 */
export async function createSession(
  userId: string,
  data: {
    date: string;
    mode: "LIVE" | "RECALL";
    splitType?: "PPL" | "UPPER_LOWER" | "BRO" | "FULL_BODY" | "CUSTOM";
  }
) {
  return prisma.workoutSession.create({
    data: {
      userId,
      date: new Date(data.date),
      mode: data.mode,
      splitType: data.splitType,
      status: "IN_PROGRESS",
      startedAt: data.mode === "LIVE" ? new Date() : null,
    },
  });
}

/**
 * Reap EMPTY stale sessions for a user.
 *
 * THE RULE THIS ENCODES:
 * ──────────────────────
 * A session with sets is a RECORD of training. A session with no sets is
 * litter. Delete litter; never delete or hide a record.
 *
 * stale := status = IN_PROGRESS AND updated_at older than `staleHours`
 *          AND the session has zero sets → delete.
 *
 * WHY SESSIONS WITH SETS ARE LEFT ALONE (this used to CANCEL them):
 * ─────────────────────────────────────────────────────────────────
 * "Unfinished" is not "abandoned", and no timeout can tell them apart —
 * only the content can. Two real users:
 *   • logs six sets, walks out, never taps finish
 *   • comes back on Thursday to add sets to Monday's session
 * They are frequently the SAME person on different days. Cancelling on a
 * timer breaks the second one badly: lockActiveSessionForUser requires
 * IN_PROGRESS, so a cancelled session REFUSES new sets, and getSessionsByDate
 * hides it — so they would start a second session for that date and split
 * their training across one hidden session and one visible one.
 *
 * So a session with sets simply stays open, visible, and editable forever.
 * CANCELLED now means only what it should: the user deliberately discarded a
 * workout. Nothing automatic ever sets it.
 *
 * Called from startSession behind try/catch so cleanup never fails the
 * user's primary action. Serialization vs set mutations: whoever wins the
 * row lock either moves updated_at (session is spared) or commits the delete
 * (mutation's FOR UPDATE then matches zero rows → NotFoundError).
 */
export async function reapStaleSessions(
  userId: string,
  staleHours: number
): Promise<void> {
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    // Take the same row locks mutations use, so reaper and set writes
    // serialize under READ COMMITTED (see file header).
    //
    // The lock is scoped to EMPTY sessions — the only ones we delete. Locking
    // sessions that have sets would needlessly contend with someone adding a
    // set to an older session (the back-filler), for rows we never touch.
    await tx.$queryRaw`
      SELECT ws.id FROM workout_sessions ws
      WHERE ws.user_id = ${userId}
        AND ws.status = 'IN_PROGRESS'
        AND ws.updated_at < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM exercise_sets es WHERE es.session_id = ws.id
        )
      FOR UPDATE
    `;

    await tx.workoutSession.deleteMany({
      where: {
        userId,
        status: "IN_PROGRESS",
        updatedAt: { lt: cutoff },
        exerciseSets: { none: {} },
      },
    });
  });
}

/**
 * Explicitly discard an active session — the ONLY thing that writes CANCELLED.
 *
 * This is the deliberate user action the reaper deliberately does not take:
 * the reaper cannot tell "abandoned" from "unfinished", but a user tapping
 * "Discard workout" is telling us directly.
 *
 * Soft-cancel rather than delete: the sets stay in the database, so a mis-tap
 * is recoverable by an operator, and getSessionsByDate's CANCELLED filter
 * removes it from the UI — which is exactly what the user asked for.
 *
 * Owner-scoped and locked like every other session mutation. Returns false when
 * the lock matches nothing (missing, not yours, or already finished/cancelled),
 * which callers map to NotFoundError.
 */
export async function cancelActiveSessionForUser(
  sessionId: string,
  userId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockActiveSessionForUser(tx, sessionId, userId);
    if (!locked) return false;

    await tx.workoutSession.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", endedAt: new Date() },
    });
    return true;
  });
}

/**
 * Get all workout sessions for a user on a specific date.
 *
 * CANCELLED is hidden because it now means only one thing: the user
 * deliberately discarded that workout. Nothing automatic ever sets it (the
 * reaper only DELETES empty sessions — see reapStaleSessions), so this filter
 * can never hide real training.
 *
 * IN_PROGRESS must stay included, and not only to resume today's session: an
 * unfinished workout from any past date stays visible and editable here, which
 * is what lets someone go back and add to it days later.
 */
export async function getSessionsByDate(userId: string, date: string) {
  return prisma.workoutSession.findMany({
    where: {
      userId,
      date: new Date(date),
      status: { not: "CANCELLED" },
    },
    include: {
      exerciseSets: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              muscleGroup: true,
              category: true,
              metValue: true,
              isCompound: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetch a single session ONLY if it belongs to the given user.
 * Returns null if the session doesn't exist or isn't owned by the user.
 *
 * This is the ownership gate used by read paths and pre-checks. Write paths
 * that mutate use lockActiveSessionForUser instead (locked + status filter).
 */
export async function findSessionForUser(sessionId: string, userId: string) {
  return prisma.workoutSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      exerciseSets: {
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              muscleGroup: true,
              category: true,
              metValue: true,
              isCompound: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

/**
 * Add a set to an active session.
 *
 * - Locks the session (owner + IN_PROGRESS).
 * - If clientRequestId is present and a row already exists, returns it
 *   (idempotent replay — no second insert).
 * - Derives setNumber server-side as max(setNumber)+1 for (session, exercise).
 * - Touches parent updated_at in the same transaction.
 *
 * Retry (max 3) is OUTSIDE the transaction — see file header.
 */
export async function addSet(
  sessionId: string,
  userId: string,
  data: {
    exerciseId: string;
    weight?: number;
    reps?: number;
    rpe?: number;
    isWarmup?: boolean;
    clientRequestId?: string;
  }
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < ADD_SET_MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const locked = await lockActiveSessionForUser(tx, sessionId, userId);
        if (!locked) {
          throw new NotFoundError("Session not found");
        }

        if (data.clientRequestId) {
          const existing = await tx.exerciseSet.findFirst({
            where: {
              sessionId,
              clientRequestId: data.clientRequestId,
            },
            include: {
              exercise: {
                select: { name: true, muscleGroup: true, isCompound: true },
              },
            },
          });
          if (existing) return existing;
        }

        const agg = await tx.exerciseSet.aggregate({
          where: { sessionId, exerciseId: data.exerciseId },
          _max: { setNumber: true },
        });
        const setNumber = (agg._max.setNumber ?? 0) + 1;

        const created = await tx.exerciseSet.create({
          data: {
            sessionId,
            exerciseId: data.exerciseId,
            setNumber,
            weight: data.weight,
            reps: data.reps,
            rpe: data.rpe,
            isWarmup: data.isWarmup ?? false,
            clientRequestId: data.clientRequestId,
          },
          include: {
            exercise: {
              select: { name: true, muscleGroup: true, isCompound: true },
            },
          },
        });

        await touchSessionActivity(tx, sessionId);
        return created;
      });
    } catch (error) {
      // NotFoundError must not be retried — the session is gone/owned/finished.
      if (error instanceof NotFoundError) throw error;

      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";

      if (isUniqueViolation && attempt < ADD_SET_MAX_ATTEMPTS - 1) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to add set after retries");
}

/**
 * Finish an active session under the session lock: lock → load sets → apply
 * completion payload. The service supplies burn numbers via `buildCompletion`
 * so calorie math stays out of this layer, but the read of sets and the
 * status flip share one transaction — otherwise a concurrently-logged set
 * could flip hasCardio/hasStrength or land in a session being completed.
 *
 * Returns null when the lock matches no row (service maps to NotFoundError).
 */
export async function finishActiveSessionForUser(
  sessionId: string,
  userId: string,
  buildCompletion: (sets: FinishSessionSetRow[]) => {
    durationMin: number;
    rpe?: number;
    caloriesBurnedLow: number;
    caloriesBurnedHigh: number;
    notes?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockActiveSessionForUser(tx, sessionId, userId);
    if (!locked) return null;

    const sets = await tx.exerciseSet.findMany({
      where: { sessionId },
      include: {
        exercise: {
          select: {
            category: true,
            metValue: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const data = buildCompletion(sets);

    return tx.workoutSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        durationMin: data.durationMin,
        rpe: data.rpe,
        caloriesBurnedLow: data.caloriesBurnedLow,
        caloriesBurnedHigh: data.caloriesBurnedHigh,
        endedAt: new Date(),
        notes: data.notes,
      },
    });
  });
}

/** Set row shape passed to finishActiveSessionForUser's buildCompletion. */
export type FinishSessionSetRow = {
  exercise: {
    category: string;
    metValue: number;
  };
};

/**
 * Get calorie burn summary for a date (used by dashboard).
 * Returns the low and high calorie estimates for all completed sessions.
 */
export async function getWorkoutBurnByDate(userId: string, date: string) {
  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      date: new Date(date),
      status: "COMPLETED",
    },
    select: {
      caloriesBurnedLow: true,
      caloriesBurnedHigh: true,
      durationMin: true,
    },
  });

  let totalLow = 0;
  let totalHigh = 0;
  let totalMinutes = 0;

  for (const s of sessions) {
    totalLow += s.caloriesBurnedLow ?? 0;
    totalHigh += s.caloriesBurnedHigh ?? 0;
    totalMinutes += s.durationMin ?? 0;
  }

  return {
    sessionCount: sessions.length,
    totalCaloriesLow: totalLow,
    totalCaloriesHigh: totalHigh,
    totalMinutes,
  };
}

/**
 * Owner-scoped set update, under the session lock.
 *
 * Promoted from a standalone updateMany into a transaction so concurrent
 * finish/reaper cannot race the write, and so parent updated_at moves with
 * the edit (activity signal for the reaper).
 */
export async function updateSetForUser(
  setId: string,
  sessionId: string,
  userId: string,
  data: {
    weight?: number;
    reps?: number;
    rpe?: number | null;
    isWarmup?: boolean;
  }
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockActiveSessionForUser(tx, sessionId, userId);
    if (!locked) return false;

    const result = await tx.exerciseSet.updateMany({
      where: {
        id: setId,
        sessionId,
      },
      data,
    });
    if (result.count === 0) return false;

    await touchSessionActivity(tx, sessionId);
    return true;
  });
}

/**
 * Owner-scoped set delete (same lock + activity touch as update).
 *
 * RENUMBERING — why the delete is not just a deleteMany:
 * ──────────────────────────────────────────────────────
 * `setNumber` is the user-facing "Set 3" label, so it must always read as a
 * contiguous 1..n per exercise. A plain delete leaves holes: deleting set 3
 * of 3 used to leave [1,2] but the logger still offered "Set 4", and deleting
 * the MIDDLE set left [1,3] — so the next set would have collided on 3.
 *
 * After removing the row we renumber that exercise's remaining sets in
 * ascending order inside the same transaction. Numbers only ever move DOWN,
 * and with the unique (session, exercise, setNumber) constraint the ascending
 * loop is collision-free when every set_number is already ≥ 1 (the migration
 * enforces that before the unique index lands).
 *
 * With this invariant the client can simply use "count + 1" as the next set
 * number (server still re-derives max+1 under the lock).
 */
export async function deleteSetForUser(
  setId: string,
  sessionId: string,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockActiveSessionForUser(tx, sessionId, userId);
    if (!locked) return false;

    const target = await tx.exerciseSet.findFirst({
      where: {
        id: setId,
        sessionId,
      },
      select: { id: true, exerciseId: true },
    });
    if (!target) return false;

    await tx.exerciseSet.delete({ where: { id: target.id } });

    const remaining = await tx.exerciseSet.findMany({
      where: { sessionId, exerciseId: target.exerciseId },
      orderBy: { setNumber: "asc" },
      select: { id: true, setNumber: true },
    });

    // Ascending renumber: numbers only move down, so with a unique constraint
    // on (session, exercise, setNumber) there is no intermediate collision
    // when the input is already positive and unique (post-F1 migration).
    for (let i = 0; i < remaining.length; i++) {
      const expected = i + 1;
      if (remaining[i].setNumber !== expected) {
        await tx.exerciseSet.update({
          where: { id: remaining[i].id },
          data: { setNumber: expected },
        });
      }
    }

    await touchSessionActivity(tx, sessionId);
    return true;
  });
}

/**
 * Pure renumber planner used by tests to lock the collision-free invariant:
 * for a positive unique sorted list, each step assigns expected = i+1 and
 * only writes when the stored number differs — numbers only move down, so
 * no intermediate value collides with another remaining row.
 */
export function planSetRenumbers(
  sortedSetNumbers: number[]
): { index: number; from: number; to: number }[] {
  const steps: { index: number; from: number; to: number }[] = [];
  for (let i = 0; i < sortedSetNumbers.length; i++) {
    const expected = i + 1;
    if (sortedSetNumbers[i] !== expected) {
      steps.push({ index: i, from: sortedSetNumbers[i], to: expected });
    }
  }
  return steps;
}

/**
 * Get completed sessions from the last N days (newest first).
 * Used by the Progress page's "Recent Workouts" card, so freshly logged
 * workouts show up alongside weight tracking.
 */
export async function getRecentSessions(userId: string, days: number = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.workoutSession.findMany({
    where: {
      userId,
      status: "COMPLETED",
      date: { gte: since },
    },
    orderBy: { date: "desc" },
    include: {
      exerciseSets: {
        select: {
          id: true,
          exercise: { select: { name: true } },
        },
      },
    },
  });
}

/**
 * Delete a session and all its sets (cascade).
 *
 * Authorization and delete share one transaction under FOR UPDATE so a set
 * logged between a separate ownership check and the DELETE cannot be
 * silently discarded by the cascade. Status is intentionally unfiltered —
 * completed sessions may be deleted; lockSessionForUser (not the
 * IN_PROGRESS-only lock) is the right primitive.
 */
export async function deleteSession(sessionId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockSessionForUser(tx, sessionId, userId);
    if (!locked) {
      throw new Error("Session not found or not authorized");
    }
    return tx.workoutSession.delete({
      where: { id: sessionId },
    });
  });
}
