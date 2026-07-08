/**
 * Intensity Minutes Tracker
 * ═════════════════════════
 *
 * WHAT ARE INTENSITY MINUTES?
 * ───────────────────────────
 * The WHO (World Health Organization) recommends:
 *   - 150 minutes of MODERATE activity per week, OR
 *   - 75 minutes of VIGOROUS activity per week
 *
 * Vigorous activity counts double. So 30 min of running (vigorous)
 * = 60 "intensity minutes" toward the weekly goal.
 *
 * HOW WE DETERMINE INTENSITY:
 * ───────────────────────────
 * MET value determines the intensity category:
 *   MET < 3.0  → Light (walking slowly, stretching) — doesn't count
 *   MET 3.0–5.9 → Moderate (brisk walking, light cycling)
 *   MET ≥ 6.0  → Vigorous (running, HIIT, heavy lifting)
 */

interface WorkoutForIntensity {
  metValue: number;
  durationMin: number;
}

/**
 * Calculate total intensity minutes for a given set of workouts
 *
 * @param workouts - array of workouts with MET value and duration
 * @returns total intensity minutes (vigorous counts double)
 */
export function calculateIntensityMinutes(
  workouts: WorkoutForIntensity[]
): number {
  let total = 0;

  for (const workout of workouts) {
    if (workout.metValue >= 6.0) {
      // Vigorous: counts double
      total += workout.durationMin * 2;
    } else if (workout.metValue >= 3.0) {
      // Moderate: counts 1:1
      total += workout.durationMin;
    }
    // Light (MET < 3.0): doesn't count toward the goal
  }

  return Math.round(total);
}

/**
 * Get weekly intensity status
 *
 * @param weeklyMinutes - total intensity minutes this week
 * @returns status and progress percentage
 */
export function getIntensityStatus(weeklyMinutes: number): {
  status: "BEHIND" | "ON_TRACK" | "AHEAD";
  progressPercent: number;
  remaining: number;
} {
  const TARGET = 150; // WHO recommendation
  const progressPercent = Math.min(100, Math.round((weeklyMinutes / TARGET) * 100));
  const remaining = Math.max(0, TARGET - weeklyMinutes);

  let status: "BEHIND" | "ON_TRACK" | "AHEAD";
  if (progressPercent >= 100) {
    status = "AHEAD";
  } else if (progressPercent >= 60) {
    status = "ON_TRACK";
  } else {
    status = "BEHIND";
  }

  return { status, progressPercent, remaining };
}
