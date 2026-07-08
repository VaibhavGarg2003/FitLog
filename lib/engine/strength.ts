/**
 * Strength Training Calorie Calculator
 * ═════════════════════════════════════
 *
 * WHY THIS IS HARDER THAN CARDIO:
 * ───────────────────────────────
 * Cardio is continuous (30 min running = 30 min of effort).
 * Strength training is intermittent:
 *   - 30 seconds of lifting (high effort)
 *   - 90 seconds of resting (low effort)
 *
 * So we can't just do MET × time. We need to calculate
 * ACTIVE TIME vs REST TIME separately.
 *
 * THE APPROACH:
 * ─────────────
 * 1. Calculate total active time (sets × avg time per set)
 * 2. Calculate total rest time (rest between sets × number of rests)
 * 3. Active time → apply strength MET (5-6)
 * 4. Rest time → apply resting MET (1.5, standing around)
 * 5. Sum both → total calorie burn
 *
 * RPE (Rate of Perceived Exertion) acts as a multiplier:
 *   RPE 6 (easy warmup) → 0.85× base
 *   RPE 8 (hard working set) → 1.0× base
 *   RPE 10 (max effort) → 1.15× base
 */

import { type CalorieBurnRange } from "./cardio";

// MET values for different phases of strength training
const LIFTING_MET = 5.0; // Active lifting (moderate-vigorous)
const RESTING_MET = 1.5; // Standing rest between sets

// RPE multipliers — scale of 1-10, but gym RPE is typically 5-10
const RPE_MULTIPLIERS: Record<number, number> = {
  1: 0.6,
  2: 0.65,
  3: 0.7,
  4: 0.75,
  5: 0.8,
  6: 0.85,
  7: 0.9,
  8: 1.0, // "Hard" — baseline
  9: 1.1,
  10: 1.15,
};

/**
 * Calculate calories burned during a strength training session
 *
 * @param totalSets - total number of sets in the session
 * @param avgSetDurationSec - average time per set in seconds (default 40s)
 * @param avgRestSec - average rest between sets in seconds (default 90s)
 * @param weightKg - user's body weight
 * @param rpe - Rate of Perceived Exertion (1-10, default 7)
 * @returns calorie burn range { low, high, estimate }
 */
export function calculateStrengthBurn(
  totalSets: number,
  weightKg: number,
  avgSetDurationSec: number = 40,
  avgRestSec: number = 90,
  rpe: number = 7
): CalorieBurnRange {
  // Clamp RPE to valid range
  const clampedRPE = Math.min(10, Math.max(1, Math.round(rpe)));
  const rpeMultiplier = RPE_MULTIPLIERS[clampedRPE] ?? 1.0;

  // Active time: total sets × seconds per set
  const activeTimeSec = totalSets * avgSetDurationSec;
  const activeTimeHours = activeTimeSec / 3600;

  // Rest time: (sets - 1) × rest duration (no rest after last set)
  const restTimeSec = Math.max(0, totalSets - 1) * avgRestSec;
  const restTimeHours = restTimeSec / 3600;

  // Calories burned during active lifting
  const activeBurn = LIFTING_MET * weightKg * activeTimeHours * rpeMultiplier;

  // Calories burned during rest periods (standing, walking around)
  const restBurn = RESTING_MET * weightKg * restTimeHours;

  const totalBurn = activeBurn + restBurn;

  return {
    low: Math.round(totalBurn * 0.85),
    high: Math.round(totalBurn * 1.15),
    estimate: Math.round(totalBurn),
  };
}

/**
 * Quick estimate when detailed set data isn't available
 * (e.g., user logs in Recall Mode and only provides duration + RPE)
 *
 * Uses a simplified formula: overall MET × weight × duration
 */
export function calculateStrengthBurnSimple(
  durationMin: number,
  weightKg: number,
  rpe: number = 7
): CalorieBurnRange {
  const clampedRPE = Math.min(10, Math.max(1, Math.round(rpe)));
  const rpeMultiplier = RPE_MULTIPLIERS[clampedRPE] ?? 1.0;

  // Blended MET: ~3.5 accounts for the mix of lifting + resting
  const blendedMET = 3.5;
  const durationHours = durationMin / 60;
  const totalBurn = blendedMET * weightKg * durationHours * rpeMultiplier;

  return {
    low: Math.round(totalBurn * 0.85),
    high: Math.round(totalBurn * 1.15),
    estimate: Math.round(totalBurn),
  };
}
