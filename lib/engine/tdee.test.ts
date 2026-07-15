/**
 * Engine Unit Tests — the highest-risk, cheapest-to-test code in the app.
 *
 * The July 7 audit found five SILENT logic flaws in this engine (double
 * counting, wrong protein multiplier, rounding order, ...). All compiled,
 * all ran, all returned confident wrong numbers. TypeScript cannot catch
 * "you used a bodybuilder's protein multiplier for an average user" —
 * only tests lock the audited formulas in place. These are pure functions:
 * no mocks, no database, no HTTP.
 */

import { describe, it, expect } from "vitest";
import {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacroSplit,
  calculateGoalFromTimeline,
  calculateFullProfile,
  calculateMinSafeCalories,
} from "@/lib/engine/tdee";

describe("calculateBMR (Mifflin-St Jeor)", () => {
  it("computes male BMR: 10w + 6.25h - 5a + 5", () => {
    // 820 + 1112.5 - 115 + 5 = 1822.5 → rounds to 1823
    expect(calculateBMR("MALE", 82, 178, 23)).toBe(1823);
  });

  it("computes female BMR: 10w + 6.25h - 5a - 161", () => {
    // 600 + 1031.25 - 150 - 161 = 1320.25 → 1320
    expect(calculateBMR("FEMALE", 60, 165, 30)).toBe(1320);
  });

  it("male and female differ by exactly the 166 kcal sex constant", () => {
    const male = calculateBMR("MALE", 70, 170, 25);
    const female = calculateBMR("FEMALE", 70, 170, 25);
    expect(male - female).toBe(166); // +5 vs -161
  });
});

describe("calculateTDEE (activity multipliers)", () => {
  it("applies the sedentary multiplier (1.2)", () => {
    expect(calculateTDEE(1823, "SEDENTARY")).toBe(2188); // 2187.6
  });

  it("applies the moderate multiplier (1.55)", () => {
    expect(calculateTDEE(1823, "MODERATE")).toBe(2826); // 2825.65
  });

  it("orders multipliers monotonically", () => {
    const bmr = 1700;
    const levels = [
      "SEDENTARY",
      "LIGHT",
      "MODERATE",
      "ACTIVE",
      "VERY_ACTIVE",
    ] as const;
    const values = levels.map((l) => calculateTDEE(bmr, l));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe("calculateTargetCalories (goal adjustments + floors)", () => {
  it("subtracts 500 for LOSE_FAT", () => {
    expect(calculateTargetCalories(2826, "LOSE_FAT", "MALE")).toBe(2326);
  });

  it("adds 300 for GAIN_MUSCLE", () => {
    expect(calculateTargetCalories(2826, "GAIN_MUSCLE", "MALE")).toBe(3126);
  });

  it("never goes below the male floor (1500)", () => {
    expect(calculateTargetCalories(1700, "LOSE_FAT", "MALE")).toBe(1500);
  });

  it("never goes below the female floor (1200)", () => {
    expect(calculateTargetCalories(1600, "LOSE_FAT", "FEMALE")).toBe(1200);
  });
});

describe("calculateMacroSplit (tiered protein + rounding order)", () => {
  it("uses the LOSE_FAT multiplier (1.6 g/kg) for omnivores", () => {
    const { protein } = calculateMacroSplit(2000, 80, "LOSE_FAT");
    expect(protein).toBe(128); // 80 × 1.6
  });

  it("uses the GAIN_MUSCLE multiplier (2.0 g/kg), not the old 2.2", () => {
    // The July 7 audit fix: 2.2 was a competitive-athlete number.
    const { protein } = calculateMacroSplit(2500, 82, "GAIN_MUSCLE");
    expect(protein).toBe(164); // 82 × 2.0 — would be 180 with the old 2.2
  });

  it("reduces plant-based protein by 0.2 g/kg", () => {
    const veg = calculateMacroSplit(2000, 80, "LOSE_FAT", "VEG");
    expect(veg.protein).toBe(112); // 80 × (1.6 - 0.2)
  });

  it("floors the plant-based multiplier at 1.2 g/kg", () => {
    const veg = calculateMacroSplit(2000, 80, "MAINTAIN", "VEGAN");
    expect(veg.protein).toBe(96); // 80 × max(1.2, 1.4 - 0.2)
  });

  it("gives eggetarians the full multiplier (eggs are complete protein)", () => {
    const egg = calculateMacroSplit(2000, 80, "LOSE_FAT", "EGGETARIAN");
    expect(egg.protein).toBe(128);
  });

  it("allocates 25% of calories to fat", () => {
    const { fat } = calculateMacroSplit(2000, 80, "LOSE_FAT");
    expect(fat).toBe(56); // 2000 × 0.25 / 9 = 55.56
  });

  it("computes carbs from UNROUNDED remainders (rounding-order fix)", () => {
    const { carbs } = calculateMacroSplit(2000, 80, "LOSE_FAT");
    // (2000 - 128×4 - 500) / 4 = 988 / 4 = 247 — from raw decimals
    expect(carbs).toBe(247);
  });

  it("never returns negative carbs", () => {
    // Tiny budget + heavy protein: carbs must clamp to 0, not go negative
    const { carbs } = calculateMacroSplit(800, 120, "GAIN_MUSCLE");
    expect(carbs).toBeGreaterThanOrEqual(0);
  });

  // ── FIX 7: the 25% share and the 0.5g/kg floor scale differently ──
  it("raises fat to the 0.5g/kg floor when 25% of calories falls short", () => {
    // 108kg on 1882 kcal: 25% = 52.3g, but the floor is 54g. Floor wins.
    const { fat } = calculateMacroSplit(1882, 108, "LOSE_FAT");
    expect(fat).toBe(54);
  });

  it("takes the fat shortfall out of carbs, not out of thin air", () => {
    const { protein, carbs, fat } = calculateMacroSplit(1882, 108, "LOSE_FAT");
    // Total must still reconcile to the calorie budget
    expect(protein * 4 + carbs * 4 + fat * 9).toBeLessThanOrEqual(1882 + 4);
  });
});

describe("calculateMinSafeCalories (FIX 5 — three floors)", () => {
  it("uses the absolute medical floor for small users", () => {
    // Tiny BMR, tiny TDEE: 75% of 1380 = 1035, BMR = 1150 → the 1200 floor wins
    expect(calculateMinSafeCalories(1380, 1150, "FEMALE")).toBe(1200);
  });

  it("uses BMR for sedentary users (TDEE close to BMR)", () => {
    // 75% of 2160 = 1620, absolute floor 1500 → BMR 1800 wins
    expect(calculateMinSafeCalories(2160, 1800, "MALE")).toBe(1800);
  });

  it("uses the 25%-of-TDEE cap for active users (BMR far below TDEE)", () => {
    // BMR 1700, absolute floor 1500 → 75% of 3000 = 2250 wins
    expect(calculateMinSafeCalories(3000, 1700, "MALE")).toBe(2250);
  });
});

describe("calculateGoalFromTimeline", () => {
  const base = {
    tdee: 2600,
    bmr: 1677, // 2600 / 1.55 — a MODERATE user
    sex: "MALE" as const,
    wantsMuscle: false,
  };

  it("returns MAINTAIN when target ≈ current weight", () => {
    const r = calculateGoalFromTimeline({
      ...base,
      currentWeightKg: 80,
      targetWeightKg: 80.2,
      timelineDays: 90,
    });
    expect(r.mode).toBe("MAINTAIN");
    expect(r.targetCalories).toBe(2600);
  });

  it("computes a safe fat-loss deficit from the 7700 kcal/kg rule", () => {
    const r = calculateGoalFromTimeline({
      ...base,
      currentWeightKg: 80,
      targetWeightKg: 76,
      timelineDays: 90,
    });
    // 4 kg × 7700 / 90 days = 342.2 kcal/day deficit
    expect(r.mode).toBe("LOSE_FAT");
    expect(r.isSafe).toBe(true);
    expect(r.targetCalories).toBe(2258); // 2600 - 342.2 → rounded
    expect(r.weeklyChangeKg).toBeCloseTo(0.311, 2);
  });

  it("flags timelines exceeding 1% bodyweight/week as AGGRESSIVE_WARNING", () => {
    const r = calculateGoalFromTimeline({
      ...base,
      currentWeightKg: 80,
      targetWeightKg: 70,
      timelineDays: 30, // 10 kg in a month
    });
    expect(r.mode).toBe("AGGRESSIVE_WARNING");
    expect(r.isSafe).toBe(false);
    expect(r.safeTimelineDays).toBeGreaterThan(30);
    expect(r.warningMessage).toBeTruthy();
  });

  it("computes a surplus for muscle gain and flags >0.5kg/week as unsafe", () => {
    const safe = calculateGoalFromTimeline({
      ...base,
      currentWeightKg: 70,
      targetWeightKg: 74,
      timelineDays: 120,
    });
    expect(safe.mode).toBe("GAIN_MUSCLE");
    expect(safe.dailyDeficit).toBeLessThan(0); // negative = surplus
    expect(safe.isSafe).toBe(true);

    const tooFast = calculateGoalFromTimeline({
      ...base,
      currentWeightKg: 70,
      targetWeightKg: 78,
      timelineDays: 30, // 8 kg gain in a month
    });
    expect(tooFast.isSafe).toBe(false);
  });

  it("keeps LOSE_FAT vs RECOMP driven by wantsMuscle", () => {
    const r = calculateGoalFromTimeline({
      ...base,
      wantsMuscle: true,
      currentWeightKg: 80,
      targetWeightKg: 76,
      timelineDays: 120,
    });
    expect(r.mode).toBe("RECOMP");
  });

  // ── FIX 5 regression: the 108kg case that shipped 1397 kcal as "safe" ──
  //
  // 108kg / 162.5cm / 22yo female, LIGHT activity, -26kg over 6 months.
  // BMR 1825, TDEE 2509. The required deficit is 1112 kcal/day → 1397 kcal.
  // Both PRE-FIX guards passed:
  //   - 1397 > the 1200 female floor
  //   - 1.011 kg/week < 1% of 108kg (1.08 kg/week)
  // ...yet 1397 is 428 kcal BELOW her BMR and a 44% deficit off TDEE.
  describe("the 108kg regression (July 15 audit)", () => {
    const shweta = {
      currentWeightKg: 108,
      targetWeightKg: 82,
      timelineDays: 180,
      wantsMuscle: false,
      tdee: 2509,
      bmr: 1825,
      sex: "FEMALE" as const,
    };

    it("no longer calls a sub-BMR target safe", () => {
      const r = calculateGoalFromTimeline(shweta);
      expect(r.isSafe).toBe(false);
      expect(r.mode).toBe("AGGRESSIVE_WARNING");
    });

    it("never returns the unsafe 1397 — clamps up to the safe minimum", () => {
      const r = calculateGoalFromTimeline(shweta);
      expect(r.targetCalories).not.toBe(1397);
      expect(r.targetCalories).toBe(1882); // 75% of 2509, above her 1825 BMR
      expect(r.targetCalories).toBeGreaterThanOrEqual(shweta.bmr);
    });

    it("tells her the honest timeline instead of the requested one", () => {
      const r = calculateGoalFromTimeline(shweta);
      // 26kg × 7700 / (2509 - 1882) = ~319 days ≈ 11 months, not 6
      expect(r.safeTimelineDays).toBeGreaterThan(180);
      expect(r.warningMessage).toContain("1,882");
    });

    it("passes the 1%-bodyweight rate rule — proving that guard alone is not enough", () => {
      // This is the whole point: the old code had ONLY this guard, and 1.011
      // sneaks under 1.08. The floor guard is what catches her.
      const weeklyLoss = (26 * 7700) / 180 / 7700 * 7;
      expect(weeklyLoss).toBeLessThan(108 * 0.01);
    });
  });
});

describe("calculateFullProfile (onboarding one-shot)", () => {
  it("chains BMR → TDEE → target → macros consistently", () => {
    const p = calculateFullProfile({
      sex: "MALE",
      weightKg: 82,
      heightCm: 178,
      age: 23,
      activityLevel: "MODERATE",
      goal: "LOSE_FAT",
    });
    expect(p.bmr).toBe(1823);
    expect(p.tdee).toBe(2826);
    expect(p.targetCalories).toBe(2326);
    expect(p.targetProtein).toBe(131); // 82 × 1.6
    expect(p.targetFat).toBe(65); // 2326 × 0.25 / 9
    expect(p.targetCarbs).toBe(305); // remainder from raw decimals
  });

  it("falls back to preset mode when no target/timeline is given", () => {
    const p = calculateFullProfile({
      sex: "MALE",
      weightKg: 82,
      heightCm: 178,
      age: 23,
      activityLevel: "MODERATE",
      goal: "LOSE_FAT",
    });
    expect(p.plan).toBeUndefined();
    expect(p.targetCalories).toBe(2826 - 500); // static GOAL_ADJUSTMENTS
  });

  // ── FIX 6 regression: preview and saved plan must be the same number ──
  it("saves the SAME target the Step 4 preview computes", () => {
    const shweta = {
      sex: "FEMALE" as const,
      weightKg: 108,
      heightCm: 162.5,
      age: 22,
      activityLevel: "LIGHT" as const,
      goal: "LOSE_FAT" as const,
    };

    // What Step 4 shows the user
    const bmr = calculateBMR("FEMALE", 108, 162.5, 22);
    const tdee = calculateTDEE(bmr, "LIGHT");
    const preview = calculateGoalFromTimeline({
      currentWeightKg: 108,
      targetWeightKg: 82,
      timelineDays: 180,
      wantsMuscle: false,
      tdee,
      bmr,
      sex: "FEMALE",
    });

    // What onboarding actually saves
    const saved = calculateFullProfile({
      ...shweta,
      targetWeightKg: 82,
      timelineDays: 180,
    });

    expect(saved.targetCalories).toBe(preview.targetCalories);
    expect(saved.plan?.isSafe).toBe(false);
    // Pre-fix this saved 2009 (TDEE-500) while previewing 1397 — two plans.
    expect(saved.targetCalories).not.toBe(2009);
  });

  it("ignores target/timeline for MAINTAIN (no weight change implied)", () => {
    const p = calculateFullProfile({
      sex: "FEMALE",
      weightKg: 60,
      heightCm: 165,
      age: 30,
      activityLevel: "MODERATE",
      goal: "MAINTAIN",
      targetWeightKg: 55,
      timelineDays: 90,
    });
    expect(p.plan).toBeUndefined();
    expect(p.targetCalories).toBe(p.tdee);
  });
});
