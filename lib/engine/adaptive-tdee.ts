/**
 * Adaptive TDEE Calculator
 * ════════════════════════
 *
 * WHY ADAPTIVE TDEE?
 * ──────────────────
 * The Mifflin-St Jeor formula gives a theoretical TDEE estimate.
 * But everyone's metabolism is different. After 2-4 weeks of real
 * data (weight logs + calorie intake), we can calculate what your
 * ACTUAL TDEE is based on whether you gained, lost, or maintained.
 *
 * THE MATH:
 * ─────────
 * 1 kg of body fat ≈ 7,700 kcal (not exact, but widely used).
 *
 * If you ate 2,500 kcal/day for 2 weeks (35,000 total)
 * and lost 0.5 kg, then:
 *   Energy deficit = 0.5 × 7,700 = 3,850 kcal over 14 days
 *   Actual TDEE = (35,000 + 3,850) / 14 = 2,775 kcal/day
 *
 * This is more accurate than any formula because it uses YOUR body's
 * actual response to food and exercise.
 *
 * WHEN TO USE:
 * ────────────
 * Only after the user has at least 14 days of consistent logging.
 * Before that, the Mifflin-St Jeor estimate is our best guess.
 */

interface WeightLogEntry {
  date: Date;
  weightKg: number;
}

interface CalorieDay {
  date: Date;
  totalCalories: number;
}

/**
 * Calculate adaptive TDEE from real user data
 *
 * @param weightLogs - array of weight entries (at least 2 entries, 14+ days apart)
 * @param calorieDays - daily calorie totals for the same period
 * @param currentTDEE - the formula-based TDEE we're trying to improve
 * @returns adjusted TDEE, or null if not enough data
 */
export function calculateAdaptiveTDEE(
  weightLogs: WeightLogEntry[],
  calorieDays: CalorieDay[],
  currentTDEE: number
): { adaptedTDEE: number; confidence: "LOW" | "MEDIUM" | "HIGH" } | null {
  // Need at least 2 weight logs spanning 14+ days
  if (weightLogs.length < 2 || calorieDays.length < 14) {
    return null;
  }

  // Sort by date
  const sortedWeights = [...weightLogs].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const firstWeight = sortedWeights[0];
  const lastWeight = sortedWeights[sortedWeights.length - 1];

  // Calculate time span in days
  const daySpan =
    (lastWeight.date.getTime() - firstWeight.date.getTime()) / (1000 * 60 * 60 * 24);

  if (daySpan < 14) return null; // Not enough time span

  // Weight change in kg
  const weightChange = lastWeight.weightKg - firstWeight.weightKg;

  // Energy equivalent of weight change (7700 kcal per kg)
  const energyFromWeightChange = weightChange * 7700;

  // Total calories consumed in the period
  const totalConsumed = calorieDays.reduce(
    (sum, day) => sum + day.totalCalories,
    0
  );

  // Actual TDEE = (total consumed + energy from weight change) / days
  // If weight went DOWN, energyFromWeightChange is negative,
  // so actual TDEE > consumed (they were in deficit)
  const adaptedTDEE = Math.round(
    (totalConsumed - energyFromWeightChange) / daySpan
  );

  // Confidence based on data quality
  // More days + more weight logs = higher confidence
  const confidence: "LOW" | "MEDIUM" | "HIGH" =
    daySpan >= 28 && weightLogs.length >= 8
      ? "HIGH"
      : daySpan >= 21 && weightLogs.length >= 4
        ? "MEDIUM"
        : "LOW";

  // Sanity check: don't allow wild swings (>30% from formula TDEE)
  // This catches bad data (forgotten meals, water weight spikes)
  const maxDeviation = currentTDEE * 0.3;
  if (Math.abs(adaptedTDEE - currentTDEE) > maxDeviation) {
    return { adaptedTDEE: currentTDEE, confidence: "LOW" };
  }

  return { adaptedTDEE, confidence };
}
