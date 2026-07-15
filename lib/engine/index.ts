/**
 * Calorie Engine — Barrel Export
 * ══════════════════════════════
 *
 * This file re-exports everything from all engine modules.
 * Other parts of the codebase import from here:
 *
 *   import { calculateBMR, calculateCardioBurn } from "@/lib/engine";
 *
 * Instead of importing from individual files. This keeps imports
 * clean and lets us reorganize internal files without breaking consumers.
 */

export {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacroSplit,
  calculateFullProfile,
  calculateGoalFromTimeline,
  calculateMinSafeCalories,
  FAT_GRAMS_PER_KG_FLOOR,
  MAX_DEFICIT_FRACTION_OF_TDEE,
} from "./tdee";

export { calculateCardioBurn, type CalorieBurnRange } from "./cardio";

export {
  calculateStrengthBurn,
  calculateStrengthBurnSimple,
} from "./strength";

export { calculateStepCalories, getStepCategory } from "./steps";

export {
  calculateIntensityMinutes,
  getIntensityStatus,
} from "./intensity";

export { calculateAdaptiveTDEE } from "./adaptive-tdee";

export {
  checkCalorieFloor,
  checkDeficitRate,
  checkFatGramFloor,
  checkWeeklyLossRateFromGoal,
} from "./safety";
