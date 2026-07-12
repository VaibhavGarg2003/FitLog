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
});

describe("calculateGoalFromTimeline", () => {
  const base = { tdee: 2600, sex: "MALE" as const, wantsMuscle: false };

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
});
