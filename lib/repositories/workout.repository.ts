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
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/utils/errors";

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
        // set_number is the tie-breaker, not decoration. A bulk import writes
        // many rows in one transaction; if two ever share a created_at, the
        // database is free to return them in any order, and both set lists in
        // the UI render in exactly this order without re-sorting.
        orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
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
      // NotFoundError, not a bare Error: handleRouteError treats unknown
      // errors as bugs (500 + Sentry). A missing or someone else's session is
      // an expected outcome and must answer 404 — same IDOR-safe reply as
      // every other session mutation, never "forbidden".
      throw new NotFoundError("Session not found");
    }
    return tx.workoutSession.delete({
      where: { id: sessionId },
    });
  });
}

/**
 * Every unfinished workout that still holds sets, across ALL dates.
 *
 * WHY THIS IS NOT DATE-SCOPED:
 * ────────────────────────────
 * The workout page's date strip only offers the last 7 days, so a session
 * older than that is unreachable by navigation — which is precisely the
 * forgetful user the reaper now preserves sessions for. Surfacing them only
 * on their own date meant the person who most needed the feature could never
 * see it.
 *
 * Empty sessions are excluded: nothing was logged, so there is nothing to
 * resume, and the reaper deletes them as litter.
 */
export async function getUnfinishedSessionsForUser(userId: string) {
  return prisma.workoutSession.findMany({
    where: {
      userId,
      status: "IN_PROGRESS",
      exerciseSets: { some: {} },
    },
    select: {
      id: true,
      date: true,
      exerciseSets: {
        select: {
          id: true,
          exercise: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 20,
  });
}

/**
 * Shown when an AI import collides with sets an earlier attempt already saved.
 * Points at what the user can actually do: the saved sets are on the workout
 * page, and removing them from the draft lets the rest go through.
 */
const STALE_DRAFT_MESSAGE =
  "Some of this workout was already saved — you can see it in your workout list. Remove those exercises here, then add the rest.";

/** One row of an AI import, ready for createMany. */
export interface PlannedImportRow {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
  clientRequestId: string;
  createdAt: Date;
}

/**
 * Turn a reviewed draft into concrete set rows: assign set numbers and a
 * strictly increasing created_at.
 *
 * PURE, and exported, because it holds the two invariants most worth testing
 * and the surrounding transaction cannot be unit-tested without a database:
 *
 *   • set_number continues from what the session already holds, per exercise,
 *     and keeps counting when the SAME exercise appears twice in one payload
 *     (a user can describe bench at the top and again at the bottom)
 *   • created_at increases by 1ms per row, so the order the user described the
 *     workout in survives a bulk insert — Postgres now() is the transaction
 *     start time, identical for every row, and both set lists in the UI render
 *     in created_at order without re-sorting
 *
 * `nextNumber` is consumed and mutated: the caller seeds it from the session's
 * current maxima.
 */
export function planImportRows(input: {
  sessionId: string;
  exercises: Array<{
    exerciseId: string;
    sets: Array<{
      weight?: number | null;
      reps?: number | null;
      rpe?: number | null;
      isWarmup: boolean;
      clientRequestId: string;
    }>;
  }>;
  nextNumber: Map<string, number>;
  baseMs: number;
}): PlannedImportRow[] {
  let offset = 0;

  return input.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => {
      const setNumber = input.nextNumber.get(exercise.exerciseId) ?? 1;
      input.nextNumber.set(exercise.exerciseId, setNumber + 1);

      return {
        sessionId: input.sessionId,
        exerciseId: exercise.exerciseId,
        setNumber,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        isWarmup: set.isWarmup,
        clientRequestId: set.clientRequestId,
        createdAt: new Date(input.baseMs + offset++),
      };
    })
  );
}

/**
 * Commit one reviewed AI draft: find-or-create the session, insert every set,
 * optionally finish — all inside ONE transaction.
 *
 * WHY ONE TRANSACTION: a half-imported workout is worse than none. The user
 * would have to find which of twenty sets landed and delete them by hand, and
 * only while the session is still IN_PROGRESS. Either the whole paragraph
 * becomes rows or nothing does.
 *
 * IDEMPOTENCY — two checks, because they cover different failures:
 *
 *   (a) sets already present. Every set carries a client_request_id generated
 *       once per import. If any of them already exists for this user, this is
 *       a retry of a request that DID commit (the client just never saw the
 *       response) — return that session untouched. This is the general case
 *       and covers appends, finishes and partial redeliveries.
 *
 *   (b) session already stamped. workout_sessions.ai_import_id is unique per
 *       user, so a session created by this import is findable directly. It is
 *       the audit/undo handle, and a second net for the create path.
 *
 * SET NUMBERING: set_number is derived here from max+1 per exercise, INSIDE
 * the lock, exactly like addSet. Numbers are assigned in JS before a single
 * createMany rather than one insert per set: forty sequential round trips to a
 * remote Postgres would risk the transaction timeout.
 *
 * CREATED_AT IS SET EXPLICITLY, and that is load-bearing. Postgres now() is
 * the TRANSACTION start time, so every row of a bulk insert shares one
 * timestamp; getSessionsByDate orders sets by created_at, and both set lists
 * in the UI render in that order. Identical timestamps would let the database
 * hand back "set 3, set 1, set 2". Explicit ascending timestamps preserve the
 * order the user described the workout in.
 */
export async function importWorkoutSets(
  userId: string,
  data: {
    importId: string;
    date: string;
    exercises: Array<{
      exerciseId: string;
      sets: Array<{
        weight?: number | null;
        reps?: number | null;
        rpe?: number | null;
        isWarmup: boolean;
        clientRequestId: string;
      }>;
    }>;
    finish: boolean;
    durationMin?: number;
    notes?: string;
  },
  buildCompletion: (sets: FinishSessionSetRow[]) => {
    durationMin: number;
    rpe?: number;
    caloriesBurnedLow: number;
    caloriesBurnedHigh: number;
    notes?: string;
  }
): Promise<{
  sessionId: string;
  createdSession: boolean;
  setsAdded: number;
  finished: boolean;
  replayed: boolean;
}> {
  const requestIds = data.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => set.clientRequestId)
  );

  const runImport = async () =>
    prisma.$transaction(
      async (tx) => {
        // ── SERIALIZE EVERY ATTEMPT AT THIS IMPORT — first statement ──
        //
        // Without this, two identical requests never touch a common row, so
        // nothing makes them queue:
        //   A and B both pass the replay checks (neither can see the other's
        //   uncommitted rows). A appends to the day's open session S and
        //   FINISHES it. B was waiting on S's row lock; when A commits, B
        //   re-evaluates under READ COMMITTED, S is no longer IN_PROGRESS, so
        //   B matches nothing, creates a SECOND session and finishes that.
        //   No unique index is violated — per-set keys are scoped to a session
        //   and only a created session carries ai_import_id — so the P2002
        //   retry below never fires. Two immutable copies of one workout.
        //
        // A transaction-scoped advisory lock on (user, importId) is the
        // serialization point the data model does not provide. The second
        // attempt blocks here until the first commits, and the replay checks
        // BELOW then see its rows — which is why they run after this line.
        // The wait is BOUNDED. An advisory lock waits inside the transaction,
        // so it spends the same budget the work needs: if the first attempt
        // takes 4.8s of a 5s transaction, the second would acquire the lock
        // with nothing left and fail on the work instead of answering "already
        // saved". lock_timeout caps the wait at 2s and leaves the rest for the
        // import itself. SET LOCAL — scoped to this transaction, so it cannot
        // leak onto the next request sharing this pooled connection.
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${userId}:${data.importId}`}, 0)
          )
        `;
        // Scope the timeout to the advisory wait ONLY. Left in place it also
        // applies to the session FOR UPDATE further down, and a timeout there
        // would be reported as "this import is already running" — which would
        // be a lie: that lock is contended by ordinary set logging, not by a
        // second copy of this request.
        await tx.$executeRaw`SET LOCAL lock_timeout = 0`;

        // ── (a) Replay: were these exact sets already written? ──
        //
        // Every set carries a client_request_id minted once when the draft was
        // created and persisted with it. If ALL of them are already present,
        // this is a retry of a request that committed and whose response was
        // lost — return that session, write nothing.
        const alreadyWritten = await tx.exerciseSet.findMany({
          where: {
            clientRequestId: { in: requestIds },
            session: { userId },
          },
          select: { sessionId: true, clientRequestId: true },
        });

        const writtenIds = new Set(
          alreadyWritten
            .map((row) => row.clientRequestId)
            .filter((id): id is string => id !== null)
        );

        if (writtenIds.size === requestIds.length && alreadyWritten.length > 0) {
          return {
            sessionId: alreadyWritten[0].sessionId,
            createdSession: false,
            setsAdded: 0,
            finished: false,
            replayed: true,
          };
        }

        // ── A PARTIAL match is a conflict, and we refuse to guess ──
        //
        // An earlier version filtered the known keys out and inserted the rest.
        // That was wrong in the case it most mattered: the user deletes a set
        // in the review, imports, the response is lost, and the RECOVERED draft
        // still holds the original keys — so the "missing" key is the set they
        // deliberately removed, and filtering would resurrect it. It can also
        // split one import across two sessions, since keys are only unique per
        // session.
        //
        // Refusing costs a rare, honest error. Guessing silently rewrites what
        // the user decided.
        if (writtenIds.size > 0) {
          throw new ConflictError(STALE_DRAFT_MESSAGE);
        }

        // ── (b) This import id already created a session, but the payload differs ──
        //
        // Reaching here means check (a) found NONE of these keys, so this is not
        // a replay of what that session holds. It used to be answered as one —
        // `replayed: true`, nothing written — which lost data silently: a user
        // whose first import committed (response lost) resumes the draft, adds
        // an exercise, removes the already-saved ones after the conflict above,
        // and retries. Only the new exercise is sent; its keys are new; the old
        // stamp matched; the server said "already saved"; the app cleared the
        // draft. The new exercise was gone.
        //
        // A true replay is decided by the per-set keys alone (check a). A stamp
        // hit with different keys is a stale draft, and says so. The client
        // answers a 409 by starting a fresh import id — safe, because replay
        // detection never depended on the id, only on the keys.
        const stamped = await tx.workoutSession.findFirst({
          where: { userId, aiImportId: data.importId },
          select: { id: true },
        });

        if (stamped) {
          throw new ConflictError(STALE_DRAFT_MESSAGE);
        }

      // ── Every exercise id must still exist ──
      const exerciseIds = data.exercises.map((exercise) => exercise.exerciseId);
      const known = await tx.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true },
      });

      if (known.length !== new Set(exerciseIds).size) {
        // Stale draft naming an exercise that no longer exists. Fail before
        // writing anything rather than half-way through with an FK error.
        throw new NotFoundError("One of those exercises no longer exists");
      }

      // ── Find or create the session for this date ──
      // Append to the day's in-progress session when there is one, so an AI
      // import behaves exactly like tapping sets in during that workout.
      //
      // The date parameter is bound as TEXT and cast with ::date on purpose.
      // `date` is a @db.Date column; binding a JS Date sends a timestamp, and
      // Postgres then casts one side using the session's timezone. On a
      // non-UTC database session that comparison stops matching, and the
      // import would quietly create a SECOND session every time instead of
      // appending — splitting one day's training across two sessions.
      const openSessions = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM workout_sessions
        WHERE user_id = ${userId}
          AND date = ${data.date}::date
          AND status = 'IN_PROGRESS'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `;

      let sessionId = openSessions[0]?.id ?? null;
      let createdSession = false;

      if (!sessionId) {
        const created = await tx.workoutSession.create({
          data: {
            userId,
            date: new Date(data.date),
            mode: "RECALL",
            status: "IN_PROGRESS",
            aiImportId: data.importId,
          },
          select: { id: true },
        });
        sessionId = created.id;
        createdSession = true;
      }

      // ── Numbering: continue from what this session already holds ──
      const existingMax = await tx.exerciseSet.groupBy({
        by: ["exerciseId"],
        where: { sessionId, exerciseId: { in: exerciseIds } },
        _max: { setNumber: true },
      });

      const nextNumber = new Map<string, number>();
      for (const row of existingMax) {
        nextNumber.set(row.exerciseId, (row._max.setNumber ?? 0) + 1);
      }

      // Timestamps come from the DATABASE, never the application clock:
      // every other row in this table gets created_at from Postgres now(), and
      // stamping these from a serverless instance would let clock skew between
      // instances interleave an import with sets logged by hand.
      //
      // now() alone is not enough either. It is the TRANSACTION start time, so
      // a second import that began before the first committed — and then sat
      // waiting on a lock — would stamp rows EARLIER than the ones already in
      // the session, and they would render above them. Taking the greater of
      // now() and the session's newest row makes the sequence monotonic no
      // matter how long this transaction waited.
      const [clock] = await tx.$queryRaw<[{ now: Date }]>`SELECT now()`;
      const latest = await tx.exerciseSet.aggregate({
        where: { sessionId },
        _max: { createdAt: true },
      });

      const base = Math.max(
        clock.now.getTime(),
        (latest._max.createdAt?.getTime() ?? 0) + 1
      );

      const rows = planImportRows({
        sessionId,
        exercises: data.exercises,
        nextNumber,
        baseMs: base,
      });

      await tx.exerciseSet.createMany({ data: rows });
      await touchSessionActivity(tx, sessionId);

      // ── Optionally complete the session in the same transaction ──
      let finished = false;
      if (data.finish) {
        const sets = await tx.exerciseSet.findMany({
          where: { sessionId },
          include: {
            exercise: { select: { category: true, metValue: true } },
          },
          orderBy: { createdAt: "asc" },
        });

        const completion = buildCompletion(sets);

        await tx.workoutSession.update({
          where: { id: sessionId },
          data: {
            status: "COMPLETED",
            durationMin: completion.durationMin,
            rpe: completion.rpe,
            caloriesBurnedLow: completion.caloriesBurnedLow,
            caloriesBurnedHigh: completion.caloriesBurnedHigh,
            endedAt: new Date(),
            notes: completion.notes,
          },
        });
        finished = true;
      }

        return {
          sessionId,
          createdSession,
          setsAdded: rows.length,
          finished,
          replayed: false,
        };
      },
      // maxWait (waiting for a connection) and timeout (running) ADD UP, and
      // the whole request has to fit inside the platform's ~10s function
      // ceiling with auth, validation and the response on top. 5+2 leaves
      // headroom; 8+4 did not.
      { timeout: 5000, maxWait: 2000 }
    );

  try {
    return await runImport();
  } catch (error) {
    // Two identical imports racing: both pass the replay checks (neither can
    // see the other's uncommitted rows under READ COMMITTED) and one loses on
    // a unique index — (session_id, client_request_id) or (user_id,
    // ai_import_id). The data is correct either way: exactly one copy landed.
    // Reporting that as a 500 would tell the user their workout failed while
    // it is sitting in the database. Re-run, and this time the replay check
    // finds the winner's rows.
    // A bounded wait that expired (Postgres 55P03) means another attempt at
    // THIS import is still running. Saying so beats a generic 500: the write
    // is in flight, not lost, and retrying in a moment will report it as a
    // replay.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("55P03") || /lock timeout/i.test(message)) {
      throw new ValidationError(
        "This workout is already being saved. Give it a moment, then check the workout list."
      );
    }

    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";

    if (!isUniqueViolation) throw error;
    return runImport();
  }
}
