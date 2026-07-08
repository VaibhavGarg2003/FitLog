/**
 * Cardio Calorie Calculator
 * ═════════════════════════
 *
 * WHAT IS MET?
 * ────────────
 * MET = Metabolic Equivalent of Task.
 * 1 MET = the energy you burn sitting still (≈1 kcal/kg/hour).
 * Running at 10 km/h has a MET of ~10 → you burn 10× more
 * than sitting still.
 *
 * THE FORMULA:
 * ────────────
 * Calories burned = MET × weight_kg × duration_hours
 *
 * WHY A RANGE?
 * ────────────
 * Calorie estimates are inherently imprecise. Heart rate, fitness
 * level, environmental conditions all affect the real number.
 * Returning a range (±15%) is more honest than a single number.
 *
 * Example: Running at MET 10, 75kg person, 30 min
 *   Base = 10 × 75 × 0.5 = 375 kcal
 *   Range = { low: 319, high: 431 }
 */

export interface CalorieBurnRange {
  low: number;
  high: number;
  estimate: number; // The middle value — best single guess
}

/**
 * Calculate calories burned during a cardio session
 *
 * @param metValue - MET value of the activity (from exercise table)
 * @param weightKg - user's body weight in kg
 * @param durationMin - session duration in minutes
 * @returns calorie burn range { low, high, estimate }
 */
export function calculateCardioBurn(
  metValue: number,
  weightKg: number,
  durationMin: number
): CalorieBurnRange {
  // Convert minutes to hours (MET formula uses hours)
  const durationHours = durationMin / 60;

  // Core formula: MET × weight × time
  const baseBurn = metValue * weightKg * durationHours;

  // ±15% range to account for individual variation
  return {
    low: Math.round(baseBurn * 0.85),
    high: Math.round(baseBurn * 1.15),
    estimate: Math.round(baseBurn),
  };
}
