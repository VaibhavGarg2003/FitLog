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
 */

import { prisma } from "@/lib/supabase/prisma";

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
 * Get all workout sessions for a user on a specific date.
 * Includes all sets with exercise details.
 */
export async function getSessionsByDate(userId: string, date: string) {
  return prisma.workoutSession.findMany({
    where: {
      userId,
      date: new Date(date),
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
 * This is the ownership gate used by write operations (add set, finish).
 * Looking up by (id + userId) means another user's session id simply
 * returns null — no data leaks, and the caller can't act on it.
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
 * Add a set to a workout session.
 */
export async function addSet(
  sessionId: string,
  data: {
    exerciseId: string;
    setNumber: number;
    weight?: number;
    reps?: number;
    rpe?: number;
    isWarmup?: boolean;
    durationSeconds?: number;
    distanceMeters?: number;
  }
) {
  return prisma.exerciseSet.create({
    data: {
      sessionId,
      exerciseId: data.exerciseId,
      setNumber: data.setNumber,
      weight: data.weight,
      reps: data.reps,
      rpe: data.rpe,
      isWarmup: data.isWarmup ?? false,
    },
    include: {
      exercise: {
        select: { name: true, muscleGroup: true, isCompound: true },
      },
    },
  });
}

/**
 * Complete a workout session — set status, duration, and calorie estimates.
 */
export async function completeSession(
  sessionId: string,
  data: {
    durationMin: number;
    rpe?: number;
    caloriesBurnedLow: number;
    caloriesBurnedHigh: number;
    notes?: string;
  }
) {
  return prisma.workoutSession.update({
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
}

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
 * Owner-scoped set update. The relation filter walks set → session → user in
 * ONE query: a set that isn't the caller's (or belongs to a finished session)
 * updates zero rows → the service answers 404/validation, never "forbidden".
 * IN_PROGRESS only: completed sessions already have calorie burns computed
 * from their sets — editing those would silently invalidate the stored math.
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
  const result = await prisma.exerciseSet.updateMany({
    where: {
      id: setId,
      sessionId,
      session: { userId, status: "IN_PROGRESS" },
    },
    data,
  });
  return result.count > 0;
}

/**
 * Owner-scoped set delete (same relation-filter pattern as update above).
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
 * and the whole thing is atomic, so a reader never sees a half-renumbered
 * exercise. With this invariant the client can simply use "count + 1" as the
 * next set number.
 */
export async function deleteSetForUser(
  setId: string,
  sessionId: string,
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    // Owner-scoped read first — we need the exerciseId to know what to
    // renumber, and this doubles as the permission check.
    const target = await tx.exerciseSet.findFirst({
      where: {
        id: setId,
        sessionId,
        session: { userId, status: "IN_PROGRESS" },
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

    for (let i = 0; i < remaining.length; i++) {
      const expected = i + 1;
      if (remaining[i].setNumber !== expected) {
        await tx.exerciseSet.update({
          where: { id: remaining[i].id },
          data: { setNumber: expected },
        });
      }
    }

    return true;
  });
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
 */
export async function deleteSession(sessionId: string, userId: string) {
  // Verify ownership first
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });

  if (!session || session.userId !== userId) {
    throw new Error("Session not found or not authorized");
  }

  return prisma.workoutSession.delete({
    where: { id: sessionId },
  });
}
