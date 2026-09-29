import { describe, it, expect } from "vitest";
import { buildFacts, goalPace, longestDayStreak, longestWeekStreak, targetOnDay, type PeriodRows } from "@/lib/insights/facts";

const ctx = { goal: null, fitnessGoal: "LOSE_FAT", strictness: "MODERATE", dietaryType: "NON_VEG" };
const empty: PeriodRows = { nutrition: [], workouts: [], weights: [], sets: [], revisions: [] };

describe("targetOnDay", () => {
  const revs = [
    { effectiveFrom: "2026-01-01", targetCalories: 1800, targetProtein: 140 },
    { effectiveFrom: "2026-04-01", targetCalories: 2600, targetProtein: 160 },
  ];
  it("uses the target in force that day — March is judged against 1,800, not today's 2,600", () => {
    expect(targetOnDay(revs, "2026-03-14")?.targetCalories).toBe(1800);
    expect(targetOnDay(revs, "2026-04-01")?.targetCalories).toBe(2600);
    expect(targetOnDay(revs, "2025-12-31")).toBeNull(); // unknown, never guessed
  });
});

describe("streaks", () => {
  it("counts consecutive days and consecutive training weeks", () => {
    expect(longestDayStreak(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"])).toBe(3);
    expect(longestDayStreak([])).toBe(0);
    // weeks of 31 Aug, 7 Sep, 14 Sep trained; 21 Sep skipped; 28 Sep trained
    expect(longestWeekStreak(["2026-09-01", "2026-09-08", "2026-09-09", "2026-09-16", "2026-09-29"])).toBe(3);
  });
});

describe("buildFacts", () => {
  const rows: PeriodRows = {
    nutrition: [
      { date: "2026-03-10", calories: 1850, protein: 130, carbs: 200, fat: 60 }, // on target (1800 ±10%), protein ≥ 90% of 140
      { date: "2026-03-11", calories: 2400, protein: 90, carbs: 300, fat: 80 },  // over
      { date: "2026-03-12", calories: 0, protein: 0, carbs: 0, fat: 0 },          // not a logged day
      { date: "2026-02-28", calories: 5000, protein: 1, carbs: 1, fat: 1 },       // outside the period
    ],
    workouts: [{ date: "2026-03-10", sessions: 1 }, { date: "2026-03-20", sessions: 2 }],
    weights: [
      { date: "2026-03-01", weightKg: 84 },
      { date: "2026-03-15", weightKg: 83.4 },
      { date: "2026-03-31", weightKg: 82.8 },
    ],
    sets: [
      { date: "2026-03-10", sessionId: "s1", exerciseId: "b", exerciseName: "Bench", weight: 60, reps: 8 },
      { date: "2026-03-20", sessionId: "s2", exerciseId: "b", exerciseName: "Bench", weight: 65, reps: 8 },
    ],
    revisions: [{ effectiveFrom: "2026-01-01", targetCalories: 1800, targetProtein: 140 }],
  };

  const f = buildFacts({ type: "MONTH", start: "2026-03-01", end: "2026-03-31", partial: false }, rows, ctx);

  it("counts only logged days inside the period", () => {
    expect(f.coverage).toEqual({ foodDays: 2, workoutDays: 2, weighIns: 3, foodDayPct: 6 });
    expect(f.nutrition.avgCalories).toBe(2125);
  });

  it("judges adherence against the target in force", () => {
    expect(f.nutrition).toMatchObject({ daysWithKnownTarget: 2, daysOnCalorieTarget: 1, daysProteinHit: 1, avgTargetCalories: 1800 });
  });

  it("counts over-target and cheat-sized days, and what they cost (estimate)", () => {
    // 2,400 vs 1,800: over by 33% → over AND well over; 600 kcal ≈ 0.1 kg
    expect(f.nutrition).toMatchObject({ daysUnderTarget: 0, daysOverTarget: 1, daysWellOverTarget: 1, surplusKcalOnOverDays: 600, estimatedKgFromOverDays: 0.1 });
  });

  it("counts missed training weeks and the longest break", () => {
    // Full weeks in March 2026: 2–8, 9–15, 16–22, 23–29; trained 10th and 20th.
    expect(f.training).toMatchObject({ weeksWithoutWorkout: 2, longestGapDays: 11, avgWorkoutsPerWeek: 0.5 });
  });

  it("summarises training, strength and weight", () => {
    expect(f.training).toMatchObject({ workoutDays: 2, sessions: 3, workingSets: 2, volumeKg: 1000, direction: "UP" });
    expect(f.training.topLifts[0]).toMatchObject({ name: "Bench", firstE1rm: 76, lastE1rm: 82.3, changePct: 8 });
    expect(f.weight).toMatchObject({ start: 84, end: 82.8, change: -1.2, ratePerWeek: -0.28, plateau: false });
    expect(f.pattern).toEqual({ weight: "DOWN", strength: "UP" });
  });

  it("breaks a month into weeks, and a year into months", () => {
    expect(f.breakdown[0]).toMatchObject({ label: "week of 2026-03-01", start: "2026-03-01", end: "2026-03-01" }); // Sunday
    expect(f.breakdown.at(-1)).toMatchObject({ start: "2026-03-30", end: "2026-03-31" });
    const year = buildFacts({ type: "YEAR", start: "2026-01-01", end: "2026-12-31", partial: false }, empty, ctx);
    expect(year.breakdown).toHaveLength(12);
    expect(year.breakdown[2]).toMatchObject({ label: "2026-03", start: "2026-03-01", end: "2026-03-31" });
  });

  it("stays honest with no data", () => {
    const none = buildFacts({ type: "WEEK", start: "2026-09-21", end: "2026-09-27", partial: false }, empty, ctx);
    expect(none.nutrition.avgCalories).toBeNull();
    expect(none.weight.change).toBeNull();
    expect(none.pattern).toEqual({ weight: "UNKNOWN", strength: null });
    expect(none.breakdown).toHaveLength(7);
  });

  it("compares with the previous period when given", () => {
    const prev = buildFacts({ type: "MONTH", start: "2026-03-01", end: "2026-03-31", partial: false }, rows, ctx, {
      ...empty,
      nutrition: [{ date: "2026-02-10", calories: 2000, protein: 100, carbs: 1, fat: 1 }],
      workouts: [{ date: "2026-02-11", sessions: 1 }],
    });
    expect(prev.previous).toEqual({ avgCalories: 2000, workoutDays: 1, weightChange: null });
  });

  it("keeps a year's facts small enough to send to the AI", () => {
    const year = buildFacts({ type: "YEAR", start: "2026-01-01", end: "2026-12-31", partial: false }, rows, ctx);
    expect(JSON.stringify(year).length).toBeLessThan(4000);
  });
});

describe("goalPace", () => {
  const lose = { type: "LOSE_FAT", startValue: 90, startDate: "2025-01-01", targetValue: 80, targetDate: "2025-07-01" };

  it("compares the smoothed weight with the straight plan line", () => {
    // Plan: 90 → 80 over 181 days; by 1 Apr (90 days) the line is at ~85.0.
    expect(goalPace(lose, "2025-04-01", 85.2, -0.4)).toMatchObject({ status: "ON_TRACK", expectedKg: 85, behindKg: 0.2, remainingKg: 5.2 });
    expect(goalPace(lose, "2025-04-01", 84, -0.5)?.status).toBe("AHEAD");
  });

  it("is BEHIND with a projected finish date after the target date", () => {
    const p = goalPace(lose, "2025-04-01", 87, -0.35)!;
    expect(p).toMatchObject({ status: "BEHIND", behindKg: 2, remainingKg: 7 });
    // 7 kg at 0.35 kg/week = 20 weeks = 140 days after 1 Apr → 19 Aug, 49 days late.
    expect(p).toMatchObject({ projectedDate: "2025-08-19", daysLate: 49 });
  });

  it("is BEHIND once the goal date has passed, however close", () => {
    expect(goalPace(lose, "2025-09-30", 80.4, -0.25)).toMatchObject({ status: "BEHIND", remainingKg: 0.4, expectedKg: 80 });
  });

  it("is OFF_COURSE when the trend moves away from the target, with no projection", () => {
    expect(goalPace(lose, "2025-04-01", 88, 0.3)).toMatchObject({ status: "OFF_COURSE", projectedDate: null, daysLate: null });
  });

  it("REACHED once at the target; UNKNOWN without weigh-ins; null without a goal", () => {
    expect(goalPace(lose, "2025-09-30", 79.8, -0.1)).toMatchObject({ status: "REACHED", remainingKg: 0 });
    expect(goalPace(lose, "2025-04-01", null, null)?.status).toBe("UNKNOWN");
    expect(goalPace(null, "2025-04-01", 85, -0.4)).toBeNull();
  });

  it("judges a maintain goal on staying within 1.5 kg", () => {
    const keep = { type: "MAINTAIN", startValue: 80, startDate: "2025-10-01", targetValue: 80, targetDate: "2026-10-01" };
    expect(goalPace(keep, "2025-11-30", 81.2, 0.1)?.status).toBe("MAINTAINING");
    expect(goalPace(keep, "2025-12-31", 82.1, 0.3)?.status).toBe("DRIFTING");
  });

  it("has no verdict before the goal started, and none from a single weigh-in", () => {
    const later = { ...lose, startDate: "2025-05-01" };
    expect(goalPace(later, "2025-04-30", 88, -0.3)).toBeNull();
    expect(goalPace(lose, "2025-04-01", 87, null, 1)?.status).toBe("UNKNOWN");
  });

  it("treats a gain goal the other way round, and a no-change goal like maintenance", () => {
    const gain = { type: "GAIN_MUSCLE", startValue: 70, startDate: "2025-01-01", targetValue: 76, targetDate: "2025-07-01" };
    expect(goalPace(gain, "2025-04-01", 71.5, 0.2)).toMatchObject({ status: "BEHIND", behindKg: 1.5 });
    expect(goalPace(gain, "2025-04-01", 74, 0.4)?.status).toBe("AHEAD");
    expect(goalPace(gain, "2025-04-01", 69, -0.3)?.status).toBe("OFF_COURSE");
    const flat = { type: "RECOMP", startValue: 80, startDate: "2025-01-01", targetValue: 80, targetDate: "2025-07-01" };
    expect(goalPace(flat, "2025-04-01", 80.6, 0.1)?.status).toBe("MAINTAINING");
  });

  it("does not project a pace that would take more than 3 years", () => {
    // 8 kg at 0.051 kg/week ≈ 157 weeks > 3 years
    expect(goalPace(lose, "2025-04-01", 88, -0.051)).toMatchObject({ projectedDate: null });
  });
});
