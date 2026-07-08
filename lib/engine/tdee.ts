/**
 * TDEE Calculator — The Foundation of All Calorie Math
 * ════════════════════════════════════════════════════
 *
 * WHAT IS TDEE?
 * ─────────────
 * Total Daily Energy Expenditure. The number of calories your body
 * burns in a full day, including exercise, digestion, and just
 * being alive (breathing, pumping blood, etc.)
 *
 * THE FORMULA (Mifflin-St Jeor — most accurate for general population):
 * ────────────────────────────────────────────────────────────────────
 * Male:   BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
 * Female: BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161
 *
 * Then: TDEE = BMR × Activity Multiplier
 *
 * WHY MIFFLIN-ST JEOR?
 * ────────────────────
 * There are 3 popular BMR formulas:
 * 1. Harris-Benedict (1919) — oldest, least accurate
 * 2. Mifflin-St Jeor (1990) — most widely recommended today
 * 3. Katch-McArdle — requires body fat %, which most users don't know
 *
 * We use Mifflin-St Jeor because it doesn't require body fat data
 * and is accurate within ±10% for most people. The Adaptive TDEE
 * module self-corrects this estimate after 14+ days of real data.
 *
 * THESE ARE PURE FUNCTIONS — no database, no HTTP, no React.
 * They take numbers in and return numbers out. Testable in isolation.
 *
 * ─────────────────────────────────────────────────────────────────
 * FIX LOG (July 7, 2026 — Post-Step-2 Audit):
 *
 * Fix 1: Protein multiplier is now TIERED by goal.
 *   Before: hardcoded at 2.2 g/kg for GAIN_MUSCLE (competitive athlete number).
 *   After:  MAINTAIN=1.4, LOSE_FAT=1.6, RECOMP=1.8, GAIN_MUSCLE=2.0.
 *   Reason: 2.2 g/kg produces unrealistic targets (180g for 82kg person)
 *   that most Indian users cannot achieve from normal food.
 *
 * Fix 2: Rounding order corrected.
 *   Before: protein and fat were rounded before being subtracted to find carbs.
 *   After:  all intermediate values stay as decimals; only final grams are rounded.
 *   Reason: rounding intermediate values compounds silently over months in
 *   the Adaptive TDEE engine when it reuses stored profile values.
 *
 * Fix 3: calculateGoalFromTimeline() added.
 *   Before: goal system used 4 static presets (LOSE_FAT=-500, GAIN_MUSCLE=+300, etc.)
 *   After:  user enters target weight + timeline → engine calculates required deficit.
 *   Reason: a RECOMP user wanting to lose 10kg would take 55 weeks — the app
 *   was not telling them this. Now the deficit is calculated from real targets.
 * ─────────────────────────────────────────────────────────────────
 */

type Sex = "MALE" | "FEMALE";
type ActivityLevel =
  | "SEDENTARY"
  | "LIGHT"
  | "MODERATE"
  | "ACTIVE"
  | "VERY_ACTIVE";
type FitnessGoal = "LOSE_FAT" | "GAIN_MUSCLE" | "MAINTAIN" | "RECOMP";
type DietaryType = "VEG" | "NON_VEG" | "VEGAN" | "EGGETARIAN";

// ── Activity Multipliers ──────────────────────────────────────
// These numbers come from sports science research.
// They represent how much your daily activity increases your BMR.
//
// IMPORTANT: These multipliers ALREADY INCLUDE gym activity.
// A MODERATE user's TDEE already assumes they go to the gym 3-5 days/week.
// Workout session calorie burn must NEVER be added on top of this TDEE.
// (That would count the gym twice — once here, once in the workout logger.)
// Workout session calories are shown as INFORMATION ONLY on the dashboard.
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,    // Desk job, no exercise
  LIGHT: 1.375,      // Light exercise 1-3 days/week
  MODERATE: 1.55,    // Moderate exercise 3-5 days/week
  ACTIVE: 1.725,     // Hard exercise 6-7 days/week
  VERY_ACTIVE: 1.9,  // Athlete or physical job + exercise
};

// ── Goal Adjustments (static preset mode) ────────────────────
// Used when the user picks a goal without a specific target weight or timeline.
// For timeline-based goals, see calculateGoalFromTimeline() below.
const GOAL_ADJUSTMENTS: Record<FitnessGoal, number> = {
  LOSE_FAT: -500,   // Moderate deficit → ~0.45 kg/week loss
  GAIN_MUSCLE: +300, // Lean surplus → minimises fat gain during bulk
  MAINTAIN: 0,       // No change — eat at TDEE
  RECOMP: -200,      // Slight deficit (shown as info only — see context.md for why)
};

// ── Protein Multipliers (FIX 1 — tiered by goal) ─────────────
//
// BEFORE: hardcoded 2.2 g/kg for GAIN_MUSCLE (competitive athlete number).
//   For an 82 kg person: 82 × 2.2 = 180g/day
//   Requires: 400g chicken breast extra per day, or 3 scoops whey.
//   Not achievable for the average Indian gym-goer.
//
// AFTER: evidence-based range matched to actual goal and user type.
//   Source: ISSN recommends 1.6-2.2 g/kg for trained athletes.
//   For recreational gym-goers: 1.6-1.8 g/kg is sufficient.
//
// Vegetarian users get an additional -0.2 g/kg reduction (see calculateMacroSplit).
// Plant proteins are less bioavailable (less complete amino acid profiles).
const PROTEIN_MULTIPLIERS: Record<FitnessGoal, number> = {
  MAINTAIN: 1.4,     // General health. Easy to hit from food alone.
  LOSE_FAT: 1.6,     // Muscle preservation during deficit. Achievable without supplements.
  RECOMP: 1.8,       // Build + preserve simultaneously. 1 optional scoop whey.
  GAIN_MUSCLE: 2.0,  // Lean bulk. Manageable with planned diet + 1-2 scoops whey.
};

// ── Fat Gram Floor ────────────────────────────────────────────
// Fat must never go below 0.5g per kg of body weight.
// Fat is required for: hormone production, fat-soluble vitamin absorption
// (A, D, E, K), joint lubrication, and brain function.
export const FAT_GRAMS_PER_KG_FLOOR = 0.5;

/**
 * Calculate Basal Metabolic Rate (BMR)
 *
 * BMR = calories your body burns doing absolutely nothing
 * (lying in bed all day, no movement, just organ function)
 *
 * @param sex - MALE or FEMALE (affects the formula constant)
 * @param weightKg - body weight in kilograms
 * @param heightCm - height in centimeters
 * @param age - age in years
 * @returns BMR in kcal/day (rounded to nearest integer)
 */
export function calculateBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number
): number {
  // The +5 (male) or -161 (female) is the sex-specific constant.
  // Women have lower BMR on average due to hormonal differences.
  const sexConstant = sex === "MALE" ? 5 : -161;

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;

  // Round to nearest integer — fractional calories don't matter
  return Math.round(bmr);
}

/**
 * Calculate Total Daily Energy Expenditure (TDEE)
 *
 * TDEE = BMR × activity multiplier
 *
 * Example:
 *   BMR = 1700 (calculated above)
 *   Activity = MODERATE (multiplier = 1.55)
 *   TDEE = 1700 × 1.55 = 2,635 kcal/day
 *
 * @param bmr - from calculateBMR()
 * @param activityLevel - user's self-reported activity level
 * @returns TDEE in kcal/day
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/**
 * Calculate daily calorie target based on goal (static preset mode)
 *
 * This takes the TDEE (maintenance calories) and adds/subtracts
 * based on whether the user wants to lose, gain, or maintain.
 *
 * For a timeline-based deficit (user entered target weight + date),
 * use calculateGoalFromTimeline() instead — it produces a more
 * accurate deficit matched to the user's actual goal.
 *
 * @param tdee - from calculateTDEE()
 * @param goal - user's fitness goal
 * @param sex - used for calorie floor check
 * @returns target calories per day (never below sex-specific floor)
 */
export function calculateTargetCalories(
  tdee: number,
  goal: FitnessGoal,
  sex: Sex = "MALE"
): number {
  const calorieFloor = sex === "MALE" ? 1500 : 1200;
  const target = tdee + GOAL_ADJUSTMENTS[goal];
  return Math.max(calorieFloor, Math.round(target));
}

/**
 * Calculate macronutrient split (protein, carbs, fat in grams)
 *
 * WHY THESE RATIOS?
 * ─────────────────
 * - Protein: goal-based g/kg bodyweight (realistic, not athlete-level)
 * - Fat: 25% of total calories (minimum for hormone function)
 * - Carbs: whatever is left after protein and fat
 *
 * CALORIE VALUES PER GRAM:
 * - Protein: 4 kcal/g
 * - Carbs: 4 kcal/g
 * - Fat: 9 kcal/g
 *
 * ROUNDING (FIX 2):
 * ─────────────────
 * All intermediate values are kept as full decimals.
 * Only the final gram values are rounded at the very end.
 * This ensures carbs are calculated from the true remainders,
 * not from already-rounded protein and fat calories.
 *
 * @param targetCalories - from calculateTargetCalories()
 * @param weightKg - body weight (used for protein calculation)
 * @param goal - affects protein multiplier
 * @param dietaryType - optional; vegetarian types get -0.2 g/kg protein reduction
 * @returns { protein, carbs, fat } in grams (whole numbers)
 */
export function calculateMacroSplit(
  targetCalories: number,
  weightKg: number,
  goal: FitnessGoal,
  dietaryType?: DietaryType
): { protein: number; carbs: number; fat: number } {
  // Determine protein multiplier from goal (FIX 1)
  const baseMultiplier = PROTEIN_MULTIPLIERS[goal];

  // Vegetarian/Vegan adjustment: plant proteins are less complete,
  // so slightly less is needed (the body absorbs less per gram).
  // Eggetarian gets no reduction — eggs are a complete protein.
  const isPlantBased =
    dietaryType === "VEG" || dietaryType === "VEGAN";
  const multiplier = isPlantBased
    ? Math.max(1.2, baseMultiplier - 0.2) // floor at 1.2 regardless
    : baseMultiplier;

  // ── Keep all intermediate values as raw decimals (FIX 2) ──
  // Do NOT round until the very final return statement.

  const proteinGramsRaw = weightKg * multiplier;
  const proteinCaloriesRaw = proteinGramsRaw * 4; // 4 kcal per gram protein

  const fatCaloriesRaw = targetCalories * 0.25; // 25% of target calories
  const fatGramsRaw = fatCaloriesRaw / 9; // 9 kcal per gram fat

  // Carbs get the remainder after protein and fat are subtracted
  // Using raw (unrounded) values so no precision is lost here
  const carbCaloriesRaw =
    targetCalories - proteinCaloriesRaw - fatCaloriesRaw;
  const carbGramsRaw = Math.max(0, carbCaloriesRaw / 4); // 4 kcal per gram carb

  // ── Round only at the very end ──
  return {
    protein: Math.round(proteinGramsRaw),
    fat: Math.round(fatGramsRaw),
    carbs: Math.round(carbGramsRaw),
  };
}

/**
 * Calculate required daily calorie deficit from a target weight and timeline.
 * (FIX 3 — replaces the static GOAL_ADJUSTMENTS approach for goal-driven users)
 *
 * Instead of picking "Lose Fat = -500 kcal always", the user specifies:
 *   - Where they want to be (target weight)
 *   - When they want to get there (timeline in days)
 *
 * The engine back-calculates the exact deficit needed.
 *
 * 1 kg of fat = 7,700 calories stored energy
 * Required deficit = (weight to lose × 7,700) / days
 *
 * SAFETY:
 * ───────
 * Max safe fat loss = 1% of body weight per week.
 * If the required deficit exceeds this rate, the function returns
 * a warning with the minimum safe timeline instead.
 *
 * @returns result object with daily deficit, mode, safety info, and estimated weeks
 */
export function calculateGoalFromTimeline(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  timelineDays: number;
  wantsMuscle: boolean;
  tdee: number;
  sex: Sex;
}): {
  mode: "MAINTAIN" | "LOSE_FAT" | "GAIN_MUSCLE" | "RECOMP" | "AGGRESSIVE_WARNING";
  dailyDeficit: number;         // positive = deficit, negative = surplus
  targetCalories: number;       // tdee - dailyDeficit
  weeklyChangeKg: number;       // expected kg change per week
  estimatedWeeks: number;       // how many weeks to reach target
  isSafe: boolean;
  warningMessage?: string;      // only set when isSafe = false
  safeTimelineDays?: number;    // minimum safe timeline (when isSafe = false)
} {
  const { currentWeightKg, targetWeightKg, timelineDays, wantsMuscle, tdee, sex } = input;
  const calorieFloor = sex === "MALE" ? 1500 : 1200;

  const weightDelta = currentWeightKg - targetWeightKg; // positive = wants to lose

  // ── Maintenance ──────────────────────────────────────────
  if (Math.abs(weightDelta) < 0.5) {
    return {
      mode: "MAINTAIN",
      dailyDeficit: 0,
      targetCalories: tdee,
      weeklyChangeKg: 0,
      estimatedWeeks: 0,
      isSafe: true,
    };
  }

  // ── Muscle Gain (target weight > current weight) ──────────
  if (weightDelta < 0) {
    const weightToGain = Math.abs(weightDelta);
    const totalSurplusNeeded = weightToGain * 7700;
    const dailySurplus = totalSurplusNeeded / timelineDays;
    const weeklyGainKg = (dailySurplus * 7) / 7700;

    return {
      mode: "GAIN_MUSCLE",
      dailyDeficit: -dailySurplus,              // negative = surplus
      targetCalories: Math.round(tdee + dailySurplus),
      weeklyChangeKg: weeklyGainKg,
      estimatedWeeks: timelineDays / 7,
      isSafe: weeklyGainKg <= 0.5,             // gaining more than 0.5kg/week = too fast
    };
  }

  // ── Fat Loss ───────────────────────────────────────────────
  const totalDeficitNeeded = weightDelta * 7700;
  const dailyDeficit = totalDeficitNeeded / timelineDays;

  // Weekly loss rate
  const weeklyLossKg = (dailyDeficit * 7) / 7700;

  // Max safe loss = 1% of current body weight per week
  const maxSafeLossKgPerWeek = currentWeightKg * 0.01;

  // Check if resulting calorie target is above the safety floor
  const targetCalories = Math.round(tdee - dailyDeficit);
  const targetTooLow = targetCalories < calorieFloor;

  // Check if the rate of loss is too aggressive
  const rateTooHigh = weeklyLossKg > maxSafeLossKgPerWeek;

  if (rateTooHigh || targetTooLow) {
    // Calculate the minimum safe timeline
    // Use whichever constraint is more limiting
    const daysFromRate = (totalDeficitNeeded / maxSafeLossKgPerWeek) * 7 / 7700;
    const daysFromFloor =
      targetTooLow
        ? (totalDeficitNeeded / (tdee - calorieFloor)) // days needed at max allowed deficit
        : daysFromRate;
    const safeTimelineDays = Math.ceil(Math.max(daysFromRate, daysFromFloor));

    return {
      mode: "AGGRESSIVE_WARNING",
      dailyDeficit,
      targetCalories: Math.max(calorieFloor, targetCalories),
      weeklyChangeKg: weeklyLossKg,
      estimatedWeeks: timelineDays / 7,
      isSafe: false,
      warningMessage:
        `Your chosen timeline requires losing ${weeklyLossKg.toFixed(2)} kg/week, ` +
        `which exceeds the safe maximum of ${maxSafeLossKgPerWeek.toFixed(2)} kg/week ` +
        `(1% of your body weight). ` +
        `The minimum safe timeline to reach your goal is ${Math.ceil(safeTimelineDays / 7)} weeks.`,
      safeTimelineDays,
    };
  }

  // All safe — return the calculated plan
  return {
    mode: wantsMuscle ? "RECOMP" : "LOSE_FAT",
    dailyDeficit,
    targetCalories,
    weeklyChangeKg: weeklyLossKg,
    estimatedWeeks: timelineDays / 7,
    isSafe: true,
  };
}

/**
 * One-shot function: calculate everything for onboarding
 *
 * Takes raw user inputs → returns all calculated values.
 * Called once during onboarding, then stored in the Profile table.
 * Recalculated whenever user updates their profile.
 */
export function calculateFullProfile(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  dietaryType?: DietaryType; // optional — adjusts protein multiplier for plant-based diets
}): {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
} {
  const bmr = calculateBMR(input.sex, input.weightKg, input.heightCm, input.age);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const targetCalories = calculateTargetCalories(tdee, input.goal, input.sex);
  const macros = calculateMacroSplit(
    targetCalories,
    input.weightKg,
    input.goal,
    input.dietaryType
  );

  return {
    bmr,
    tdee,
    targetCalories,
    targetProtein: macros.protein,
    targetCarbs: macros.carbs,
    targetFat: macros.fat,
  };
}
