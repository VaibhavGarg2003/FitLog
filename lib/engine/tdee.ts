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
 * FIX LOG (July 15, 2026 — Aggressive Deficit Audit):
 *
 * Fix 5: Deficit is now bounded by BMR and by a % of TDEE, not just the
 *   absolute 1200/1500 floor and the 1%-bodyweight rate rule.
 *   Before: a 108kg / 162.5cm / 22yo woman targeting -26kg in 6 months got
 *   1397 kcal/day flagged isSafe=true. Both existing guards passed: 1397 is
 *   above the 1200 female floor, and 1.01 kg/week is under 1% of 108kg (1.08).
 *   But 1397 is 428 kcal BELOW her BMR of 1825, a 44% deficit off TDEE.
 *   Reason: the 1%-of-bodyweight rate rule scales with bodyweight, so the
 *   heavier the user, the more punishing a deficit it authorises. It cannot
 *   be the only rate guard. See calculateMinSafeCalories() below.
 *
 * Fix 6: calculateFullProfile() now honours targetWeightKg + timelineDays.
 *   Before: onboarding previewed a timeline-derived target (1397) but SAVED a
 *   static preset target (TDEE-500 = 2009). Preview and reality disagreed, and
 *   the saved plan could not reach the goal date the app had just promised.
 *   After:  when a target + timeline exist, both paths run the same math.
 *
 * Fix 7: calculateMacroSplit() enforces the 0.5g/kg fat floor structurally.
 *   Before: fat was always 25% of calories, which drops below the hormonal-
 *   health floor for heavy users on a cut (108kg needs 54g; 25% of 1882 = 52g).
 *   checkFatGramFloor() existed to warn about this but was never called.
 *   After:  fat = max(25% of calories, 0.5g/kg); carbs take the remainder.
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

// ── Maximum Deficit as a Share of TDEE (FIX 5) ────────────────
// A deficit larger than 25% of TDEE is not sustainable for a recreational
// user: it drives muscle loss, hormonal disruption, and — most practically —
// nobody adheres to it for six months.
// Standard practice is 20-25%. We take the top of that range.
export const MAX_DEFICIT_FRACTION_OF_TDEE = 0.25;

// ── Absolute Medical Floors ───────────────────────────────────
// Mirrors CALORIE_FLOORS in safety.ts. Kept here so the engine can
// clamp without importing the advisory layer.
const ABSOLUTE_CALORIE_FLOORS: Record<Sex, number> = {
  MALE: 1500,
  FEMALE: 1200,
};

/**
 * The lowest calorie target we will ever prescribe. (FIX 5)
 *
 * THREE FLOORS, WHICHEVER IS HIGHEST:
 * ───────────────────────────────────
 * 1. The absolute medical minimum (1200 F / 1500 M).
 *    Catches small users. Useless for large users — a 108kg woman clears
 *    1200 while eating 400 kcal below her own resting metabolism.
 *
 * 2. BMR. Never prescribe below what the body burns at rest.
 *    Catches sedentary users, whose TDEE sits close to BMR.
 *
 * 3. 75% of TDEE (a max 25% deficit).
 *    Catches active/heavy users, where BMR is far below TDEE and a
 *    "technically above BMR" number can still be a 40%+ deficit.
 *
 * No single one of these is sufficient — each covers a different body type.
 * The 108kg case that prompted this fix passes (1) and would pass a naive
 * rate check; only (2) and (3) catch it.
 *
 * @param tdee - maintenance calories
 * @param bmr - resting metabolic rate
 * @param sex - selects the absolute floor
 * @returns the minimum safe daily calorie target
 */
export function calculateMinSafeCalories(
  tdee: number,
  bmr: number,
  sex: Sex
): number {
  return Math.max(
    ABSOLUTE_CALORIE_FLOORS[sex],
    bmr,
    tdee * (1 - MAX_DEFICIT_FRACTION_OF_TDEE)
  );
}

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
 * @param bmr - optional; when supplied, the target is also held at or above BMR (FIX 5)
 * @returns target calories per day (never below the safe minimum)
 */
export function calculateTargetCalories(
  tdee: number,
  goal: FitnessGoal,
  sex: Sex = "MALE",
  bmr?: number
): number {
  // bmr ?? 0 makes the BMR term drop out when the caller doesn't know it —
  // the absolute and %-of-TDEE floors still apply.
  const minSafe = calculateMinSafeCalories(tdee, bmr ?? 0, sex);
  const target = tdee + GOAL_ADJUSTMENTS[goal];
  return Math.max(Math.round(minSafe), Math.round(target));
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

  // Fat is 25% of calories, but never below 0.5g/kg bodyweight (FIX 7).
  // The 25% share and the floor scale differently: the share follows the
  // calorie budget, the floor follows bodyweight. For a heavy user on a cut
  // the floor wins (108kg needs 54g; 25% of 1882 kcal is only 52g).
  const fatGramsFromShare = (targetCalories * 0.25) / 9; // 9 kcal per gram fat
  const fatGramsFloor = weightKg * FAT_GRAMS_PER_KG_FLOOR;
  const fatGramsRaw = Math.max(fatGramsFromShare, fatGramsFloor);
  const fatCaloriesRaw = fatGramsRaw * 9;

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
 * SAFETY (FIX 5 — two independent guards):
 * ────────────────────────────────────────
 * 1. Rate: max safe fat loss = 1% of body weight per week.
 * 2. Floor: the target may never fall below calculateMinSafeCalories()
 *    — i.e. never below BMR, never a deficit deeper than 25% of TDEE,
 *    never below the absolute 1200/1500 medical minimum.
 *
 * Guard 1 alone is not enough. It scales with bodyweight, so at 108kg it
 * authorises a 1,188 kcal/day deficit — which for that user is 44% of TDEE
 * and 428 kcal below BMR. Guard 2 is what catches heavy users.
 *
 * If either guard trips, the function returns AGGRESSIVE_WARNING with the
 * minimum safe timeline, and targetCalories clamped UP to the safe minimum.
 *
 * @returns result object with daily deficit, mode, safety info, and estimated weeks
 */
export function calculateGoalFromTimeline(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  timelineDays: number;
  wantsMuscle: boolean;
  tdee: number;
  bmr: number;
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
  const { currentWeightKg, targetWeightKg, timelineDays, wantsMuscle, tdee, bmr, sex } =
    input;

  // The real floor — BMR and %-of-TDEE aware, not just the medical minimum (FIX 5)
  const minSafeCalories = Math.round(calculateMinSafeCalories(tdee, bmr, sex));

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

  // Guard 1 — max safe loss = 1% of current body weight per week
  const maxSafeLossKgPerWeek = currentWeightKg * 0.01;
  const rateTooHigh = weeklyLossKg > maxSafeLossKgPerWeek;

  // Guard 2 — target must clear BMR / 25%-of-TDEE / medical floor (FIX 5)
  const targetCalories = Math.round(tdee - dailyDeficit);
  const targetTooLow = targetCalories < minSafeCalories;

  if (rateTooHigh || targetTooLow) {
    // Minimum safe timeline = whichever guard is more limiting.
    const daysFromRate = (weightDelta / maxSafeLossKgPerWeek) * 7;

    // Days needed if we ate at exactly the safe floor every day.
    // maxAllowedDeficit can be <= 0 for very small users whose TDEE already
    // sits at/below the floor — they cannot diet safely at all, so there is
    // no finite safe timeline to offer.
    const maxAllowedDeficit = tdee - minSafeCalories;
    const daysFromFloor =
      maxAllowedDeficit > 0 ? totalDeficitNeeded / maxAllowedDeficit : Infinity;

    const safeTimelineDaysRaw = Math.max(daysFromRate, daysFromFloor);
    const hasSafeTimeline = Number.isFinite(safeTimelineDaysRaw);
    const safeTimelineDays = hasSafeTimeline
      ? Math.ceil(safeTimelineDaysRaw)
      : undefined;

    // Explain the guard that actually tripped — a user told "that's too fast"
    // when the real problem is "that's below your BMR" will just shrug and
    // move the slider one notch.
    const reason = targetTooLow
      ? `That works out to ${targetCalories.toLocaleString()} kcal/day, below your safe minimum of ` +
        `${minSafeCalories.toLocaleString()} kcal (your body burns ${Math.round(bmr).toLocaleString()} kcal ` +
        `at complete rest).`
      : `That requires losing ${weeklyLossKg.toFixed(2)} kg/week, which exceeds the safe maximum of ` +
        `${maxSafeLossKgPerWeek.toFixed(2)} kg/week (1% of your body weight).`;

    const remedy = hasSafeTimeline
      ? `The shortest safe timeline for this goal is about ${Math.ceil(safeTimelineDays! / 30)} months ` +
        `(${Math.ceil(safeTimelineDays! / 7)} weeks).`
      : `Your maintenance calories are already at your safe minimum, so this goal cannot be reached ` +
        `through diet alone. Increasing your activity level would raise the calories you can safely eat.`;

    return {
      mode: "AGGRESSIVE_WARNING",
      dailyDeficit,
      // Clamp UP to the safe minimum — never hand back the unsafe number (FIX 5)
      targetCalories: Math.max(minSafeCalories, targetCalories),
      weeklyChangeKg: weeklyLossKg,
      estimatedWeeks: timelineDays / 7,
      isSafe: false,
      warningMessage: `${reason} ${remedy}`,
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
 *
 * TWO MODES (FIX 6):
 * ──────────────────
 * - Timeline mode: caller supplies targetWeightKg + timelineDays → calories
 *   come from calculateGoalFromTimeline(), the SAME function the onboarding
 *   preview shows the user. `plan` is returned so callers can surface the
 *   safety verdict.
 * - Preset mode: no target/timeline → falls back to the static GOAL_ADJUSTMENTS.
 *
 * Before this fix, onboarding previewed timeline mode and then saved preset
 * mode. The user was shown 1397 kcal and given 2009 — two different plans,
 * and the saved one could not reach the goal date the app had promised.
 */
export function calculateFullProfile(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
  dietaryType?: DietaryType; // optional — adjusts protein multiplier for plant-based diets
  targetWeightKg?: number; // optional — enables timeline mode
  timelineDays?: number; // optional — enables timeline mode
}): {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  plan?: ReturnType<typeof calculateGoalFromTimeline>;
} {
  const bmr = calculateBMR(input.sex, input.weightKg, input.heightCm, input.age);
  const tdee = calculateTDEE(bmr, input.activityLevel);

  // Timeline mode requires a real target: a weight, a deadline, and a goal
  // that actually implies weight change.
  const useTimeline =
    input.goal !== "MAINTAIN" &&
    input.targetWeightKg != null &&
    input.timelineDays != null &&
    input.timelineDays > 0;

  const plan = useTimeline
    ? calculateGoalFromTimeline({
        currentWeightKg: input.weightKg,
        targetWeightKg: input.targetWeightKg!,
        timelineDays: input.timelineDays!,
        wantsMuscle: input.goal === "RECOMP" || input.goal === "GAIN_MUSCLE",
        tdee,
        bmr,
        sex: input.sex,
      })
    : undefined;

  // plan.targetCalories is already clamped to the safe minimum by
  // calculateGoalFromTimeline, so an unsafe timeline still saves a safe number.
  const targetCalories =
    plan?.targetCalories ?? calculateTargetCalories(tdee, input.goal, input.sex, bmr);

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
    plan,
  };
}
