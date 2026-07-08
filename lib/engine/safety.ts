/**
 * Safety Floor Checker
 * ════════════════════
 *
 * WHY SAFETY FLOORS?
 * ──────────────────
 * Eating too few calories is medically dangerous:
 *   - Muscle loss, nutrient deficiency, hormone disruption
 *   - Metabolic adaptation (body lowers its own TDEE to survive)
 *   - Eating disorders
 *
 * Medical consensus minimums:
 *   Women: 1,200 kcal/day
 *   Men:   1,500 kcal/day
 *
 * These are hard floors. Even in aggressive cutting phases,
 * we should never let the app encourage going below these.
 *
 * DEFICIT RATE CHECKING:
 * ─────────────────────
 * Beyond the absolute floor, we also check the RATE of deficit.
 * Losing more than 1% of body weight per week indicates
 * an unsustainably aggressive deficit.
 *
 * Example: 80kg person → max safe loss = 0.8 kg/week
 * That's a deficit of ~880 kcal/day (0.8 × 7700 / 7)
 */

type Sex = "MALE" | "FEMALE";

const CALORIE_FLOORS: Record<Sex, number> = {
  MALE: 1500,
  FEMALE: 1200,
};

/**
 * Check if a calorie intake is above the safety floor
 *
 * @param totalCalories - user's planned/actual daily intake
 * @param sex - biological sex (affects the minimum)
 * @returns safety assessment with message
 */
export function checkCalorieFloor(
  totalCalories: number,
  sex: Sex
): {
  isSafe: boolean;
  floor: number;
  deficit: number;
  message: string;
} {
  const floor = CALORIE_FLOORS[sex];
  const deficit = floor - totalCalories;
  const isSafe = totalCalories >= floor;

  let message: string;
  if (isSafe) {
    message = "Calorie intake is within safe range.";
  } else if (deficit <= 200) {
    message = `Your intake (${totalCalories} kcal) is slightly below the recommended minimum of ${floor} kcal. Consider adding a small snack.`;
  } else {
    message = `⚠️ Your intake (${totalCalories} kcal) is significantly below the safe minimum of ${floor} kcal. This can cause muscle loss and metabolic damage. Please eat more.`;
  }

  return { isSafe, floor, deficit: Math.max(0, deficit), message };
}

/**
 * Check if the weekly weight loss rate is sustainable
 *
 * @param weeklyWeightChangKg - weight change this week (negative = loss)
 * @param currentWeightKg - current body weight
 * @returns safety assessment
 */
export function checkDeficitRate(
  weeklyWeightChangeKg: number,
  currentWeightKg: number
): {
  isSafe: boolean;
  maxSafeLossKg: number;
  actualLossKg: number;
  message: string;
} {
  // Max safe loss = 1% of body weight per week
  const maxSafeLossKg = currentWeightKg * 0.01;
  const actualLossKg = Math.abs(weeklyWeightChangeKg);

  // Only check if they're losing weight (not gaining)
  if (weeklyWeightChangeKg >= 0) {
    return {
      isSafe: true,
      maxSafeLossKg,
      actualLossKg: 0,
      message: "Weight is stable or increasing. No deficit concern.",
    };
  }

  const isSafe = actualLossKg <= maxSafeLossKg;

  const message = isSafe
    ? `Losing ${actualLossKg.toFixed(1)} kg/week. This is within the safe range (max ${maxSafeLossKg.toFixed(1)} kg/week).`
    : `⚠️ Losing ${actualLossKg.toFixed(1)} kg/week exceeds the recommended maximum of ${maxSafeLossKg.toFixed(1)} kg/week. Consider increasing calories slightly.`;

  return { isSafe, maxSafeLossKg, actualLossKg, message };
}

/**
 * Check if fat gram intake is above the minimum needed for hormonal health.
 * (Fix 4 — Post-Step-2 Audit, July 7 2026)
 *
 * WHY FAT HAS ITS OWN FLOOR (separate from calorie floor):
 * ────────────────────────────────────────────────────────
 * The calorie floor check (above) only verifies total intake is safe.
 * But even within a "safe" calorie total, the 25% fat allocation can
 * produce dangerously low fat grams for lighter users on aggressive cuts.
 *
 * Example: 50 kg woman on 1,200 kcal
 *   Fat at 25% = 300 kcal ÷ 9 = 33g
 *   Floor = 0.5g × 50 kg = 25g → passes, but barely
 *
 * Example: 45 kg woman on a slightly aggressive cut
 *   Fat could approach the 25g floor from below
 *
 * Fat is required for:
 *   - Hormone production (estrogen, testosterone, cortisol)
 *   - Absorption of fat-soluble vitamins (A, D, E, K)
 *   - Joint lubrication and brain function
 *
 * Minimum: 0.5g fat per kg of body weight per day.
 * This is the conservative consensus minimum from sports nutrition research.
 *
 * @param fatGrams - calculated daily fat intake in grams
 * @param weightKg - user's current body weight
 * @returns safety assessment with message
 */
export function checkFatGramFloor(
  fatGrams: number,
  weightKg: number
): {
  isSafe: boolean;
  floorGrams: number;
  actualGrams: number;
  shortfallGrams: number;
  message: string;
} {
  const floorGrams = weightKg * 0.5; // 0.5g per kg minimum
  const isSafe = fatGrams >= floorGrams;
  const shortfallGrams = Math.max(0, floorGrams - fatGrams);

  let message: string;
  if (isSafe) {
    message = `Fat intake (${Math.round(fatGrams)}g) is above the minimum of ${Math.round(floorGrams)}g. Hormonal health is protected.`;
  } else {
    message =
      `⚠️ Fat intake (${Math.round(fatGrams)}g) is below the minimum of ${Math.round(floorGrams)}g ` +
      `(0.5g × ${weightKg}kg bodyweight). ` +
      `Low fat intake can disrupt hormones and prevent absorption of vitamins A, D, E, K. ` +
      `Consider reducing the calorie deficit slightly or increasing fat foods (nuts, avocado, olive oil).`;
  }

  return { isSafe, floorGrams, actualGrams: fatGrams, shortfallGrams, message };
}

/**
 * Forward-looking weekly loss rate check — used at goal-setting time.
 *
 * Unlike checkDeficitRate() which checks real historical data,
 * this checks whether a PLANNED deficit is too aggressive before
 * the user even starts following the plan.
 *
 * Called by calculateGoalFromTimeline() in tdee.ts.
 * Also exported here so the API route can call it independently
 * when validating the onboarding Step 4 timeline input.
 *
 * @param dailyDeficit - planned calorie deficit per day
 * @param currentWeightKg - user's current body weight
 * @returns safety assessment
 */
export function checkWeeklyLossRateFromGoal(
  dailyDeficit: number,
  currentWeightKg: number
): {
  isSafe: boolean;
  plannedKgPerWeek: number;
  maxSafeKgPerWeek: number;
  message: string;
} {
  const plannedKgPerWeek = (dailyDeficit * 7) / 7700;
  const maxSafeKgPerWeek = currentWeightKg * 0.01; // 1% of body weight per week
  const isSafe = plannedKgPerWeek <= maxSafeKgPerWeek;

  const message = isSafe
    ? `Planned loss rate of ${plannedKgPerWeek.toFixed(2)} kg/week is within the safe limit of ${maxSafeKgPerWeek.toFixed(2)} kg/week.`
    : `⚠️ Planned loss rate of ${plannedKgPerWeek.toFixed(2)} kg/week exceeds the recommended safe limit ` +
      `of ${maxSafeKgPerWeek.toFixed(2)} kg/week (1% of body weight). ` +
      `Extend your timeline or reduce the weekly target to stay safe.`;

  return { isSafe, plannedKgPerWeek, maxSafeKgPerWeek, message };
}

