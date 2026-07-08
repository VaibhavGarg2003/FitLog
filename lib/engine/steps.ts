/**
 * Step Calorie Calculator
 * ═══════════════════════
 *
 * HOW STEP CALORIES WORK:
 * ───────────────────────
 * A commonly cited figure is ~0.04 kcal per step for an average
 * 70kg person. But this varies with body weight and stride length.
 *
 * Heavier people burn more per step (more mass to move).
 * Taller people take longer strides → fewer steps per km → more per step.
 *
 * Our formula adjusts for body weight:
 *   caloriesPerStep = 0.04 × (weightKg / 70)
 *
 * This linearly scales: a 90kg person burns ~0.051 kcal/step,
 * while a 50kg person burns ~0.029 kcal/step.
 */

import { type CalorieBurnRange } from "./cardio";

/**
 * Calculate calories burned from step count
 *
 * @param stepCount - number of steps taken
 * @param weightKg - user's body weight in kg
 * @returns calorie burn range
 */
export function calculateStepCalories(
  stepCount: number,
  weightKg: number
): CalorieBurnRange {
  // Base: 0.04 kcal/step for a 70kg reference person
  // Scale linearly with body weight
  const caloriesPerStep = 0.04 * (weightKg / 70);

  const totalBurn = stepCount * caloriesPerStep;

  return {
    low: Math.round(totalBurn * 0.85),
    high: Math.round(totalBurn * 1.15),
    estimate: Math.round(totalBurn),
  };
}

/**
 * Get step count category for UI display
 *
 * Standard categories based on health research:
 *   < 5,000  = Sedentary
 *   5,000-7,499 = Low active
 *   7,500-9,999 = Somewhat active
 *   10,000-12,499 = Active
 *   ≥ 12,500 = Highly active
 */
export function getStepCategory(
  stepCount: number
): "SEDENTARY" | "LOW_ACTIVE" | "SOMEWHAT_ACTIVE" | "ACTIVE" | "HIGHLY_ACTIVE" {
  if (stepCount < 5000) return "SEDENTARY";
  if (stepCount < 7500) return "LOW_ACTIVE";
  if (stepCount < 10000) return "SOMEWHAT_ACTIVE";
  if (stepCount < 12500) return "ACTIVE";
  return "HIGHLY_ACTIVE";
}
