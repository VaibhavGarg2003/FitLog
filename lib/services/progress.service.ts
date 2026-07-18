/**
 * Progress Service — Business Logic Layer
 * ════════════════════════════════════════
 *
 * Orchestrates weight logging + adaptive TDEE.
 *
 * ADAPTIVE TDEE (from Step 2 engine):
 * ───────────────────────────────────
 * After 14+ weight logs, the engine can calculate the user's REAL TDEE
 * by comparing actual weight change to calorie intake. This self-corrects
 * whatever the Mifflin-St Jeor formula got wrong for this specific person.
 */

import {
  logWeight,
  getWeightHistory,
  getWeightLogCount,
  getLatestWeight,
  getFirstWeight,
  getActiveGoal,
} from "@/lib/repositories/progress.repository";
import { getRecentSessions } from "@/lib/repositories/workout.repository";

/**
 * Log today's weight.
 */
export async function recordWeight(
  userId: string,
  data: { date: string; weightKg: number; notes?: string }
) {
  return logWeight(userId, data);
}

/**
 * Get full progress data for the progress page.
 * Returns weight history, current/starting weights, and goal info.
 */
export async function getProgressData(userId: string) {
  const [history, latest, first, logCount, activeGoal, recentSessions] =
    await Promise.all([
      getWeightHistory(userId, 90),
      getLatestWeight(userId),
      getFirstWeight(userId),
      getWeightLogCount(userId),
      getActiveGoal(userId),
      getRecentSessions(userId, 7),
    ]);

  const startWeight = first?.weightKg ?? null;
  const currentWeight = latest?.weightKg ?? null;
  const totalChange =
    startWeight !== null && currentWeight !== null
      ? Math.round((currentWeight - startWeight) * 10) / 10
      : null;

  // Compact shape for the Progress page's "Recent Workouts" card.
  const recentWorkouts = recentSessions.map((s) => ({
    id: s.id,
    date: s.date,
    durationMin: s.durationMin,
    caloriesBurnedLow: s.caloriesBurnedLow,
    caloriesBurnedHigh: s.caloriesBurnedHigh,
    totalSets: s.exerciseSets.length,
    exercises: [...new Set(s.exerciseSets.map((es) => es.exercise.name))],
  }));

  return {
    history: history.reverse(), // oldest first for the chart
    currentWeight,
    startWeight,
    totalChange,
    logCount,
    canUseAdaptiveTDEE: logCount >= 14,
    activeGoal,
    recentWorkouts,
  };
}

/**
 * Get just the latest weight (for dashboard quick display).
 */
export async function getCurrentWeight(userId: string) {
  return getLatestWeight(userId);
}
