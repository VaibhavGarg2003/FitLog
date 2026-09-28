/**
 * Progress Repository — Raw Prisma Queries
 * ═════════════════════════════════════════
 *
 * TABLES USED:
 * ────────────
 * WeightLog — one entry per day (@@unique on userId+date)
 * Goal      — active weight goal with checkpoints
 */

import { Prisma } from "@prisma/client";
import type { FitnessGoal } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import { ValidationError } from "@/lib/utils/errors";

/**
 * Log today's weight. Uses upsert so logging twice on the
 * same day overwrites the first entry (not duplicates).
 */
export async function logWeight(
  userId: string,
  data: { date: string; weightKg: number; notes?: string }
) {
  return prisma.weightLog.upsert({
    where: {
      userId_date: {
        userId,
        date: new Date(data.date),
      },
    },
    update: {
      weightKg: data.weightKg,
      notes: data.notes,
    },
    create: {
      userId,
      date: new Date(data.date),
      weightKg: data.weightKg,
      notes: data.notes,
    },
  });
}

/**
 * Get weight history for a user (most recent first).
 * Used by the progress chart.
 */
export async function getWeightHistory(
  userId: string,
  limit: number = 90
) {
  return prisma.weightLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
    select: {
      date: true,
      weightKg: true,
      notes: true,
    },
  });
}

/**
 * Get weight count for a user (to check if adaptive TDEE can run).
 * Adaptive TDEE needs 14+ entries.
 */
export async function getWeightLogCount(userId: string): Promise<number> {
  return prisma.weightLog.count({ where: { userId } });
}

/**
 * Get the most recent weight log entry.
 */
export async function getLatestWeight(userId: string) {
  return prisma.weightLog.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { weightKg: true, date: true },
  });
}

/**
 * Get the first weight log entry (starting weight).
 */
export async function getFirstWeight(userId: string) {
  return prisma.weightLog.findFirst({
    where: { userId },
    orderBy: { date: "asc" },
    select: { weightKg: true, date: true },
  });
}

/**
 * Get active goal for a user (if one exists).
 */
export async function getActiveGoal(userId: string) {
  return prisma.goal.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      checkpoints: {
        orderBy: { weekNumber: "asc" },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// GOAL WRITES — transaction-scoped on purpose
// ─────────────────────────────────────────────────────────────
// A goal's target weight and deadline feed the calorie engine, so changing a
// goal changes the user's targets. These take the caller's transaction client
// so the goal write, the recalculation and the target-history row commit
// together under the profile row lock (profile.repository.ts
// updateProfileWithTargets). There is deliberately no standalone version: a
// goal change that skips recalculation is exactly the bug these replaced —
// the old goal's calories stayed in force until the next Settings save.
//
// LOCK ORDER: profile row first, then goals — the same order onboarding uses
// (createUserWithProfile), so the two paths cannot deadlock.

export interface GoalInput {
  type: FitnessGoal;
  startValue: number;
  targetValue: number;
  startDate: Date;
  targetDate: Date;
}

/**
 * Make `data` the user's one ACTIVE goal, retiring any current one to
 * ABANDONED (history is kept, never deleted).
 *
 * The partial unique index goals_one_active_per_user is the real enforcer; a
 * violation (only possible from a path that skipped the profile lock) becomes
 * a deliberate conflict instead of an unhandled 500.
 */
export async function replaceActiveGoal(
  tx: Prisma.TransactionClient,
  userId: string,
  data: GoalInput
) {
  await tx.goal.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "ABANDONED" },
  });
  try {
    return await tx.goal.create({
      data: { userId, status: "ACTIVE", ...data },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError(
        "An active goal already exists for this account. Please retry."
      );
    }
    throw error;
  }
}

/** Retire the user's ACTIVE goal(s) to ABANDONED. Returns how many. */
export async function retireActiveGoals(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  const res = await tx.goal.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "ABANDONED" },
  });
  return res.count;
}

/** The ACTIVE goal as seen inside a transaction (after any write in it). */
export async function findActiveGoalTx(
  tx: Prisma.TransactionClient,
  userId: string
) {
  return tx.goal.findFirst({ where: { userId, status: "ACTIVE" } });
}
