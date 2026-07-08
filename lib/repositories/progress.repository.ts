/**
 * Progress Repository — Raw Prisma Queries
 * ═════════════════════════════════════════
 *
 * TABLES USED:
 * ────────────
 * WeightLog — one entry per day (@@unique on userId+date)
 * Goal      — active weight goal with checkpoints
 */

import { prisma } from "@/lib/supabase/prisma";

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
