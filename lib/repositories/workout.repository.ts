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
