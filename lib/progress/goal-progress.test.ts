import { describe, it, expect } from "vitest";
import { computeGoalProgress, pickCurrentWeight } from "./goal-progress";

describe("computeGoalProgress", () => {
  it("counts weight lost toward a fat-loss target", () => {
    const p = computeGoalProgress(79, 76.2, 73);
    expect(p.isGaining).toBe(false);
    expect(p.progressKg).toBeCloseTo(2.8, 5);
    expect(p.movedAwayKg).toBe(0);
    expect(p.remainingKg).toBeCloseTo(3.2, 5);
    expect(p.percentage).toBeCloseTo((2.8 / 6) * 100, 5);
    expect(p.reached).toBe(false);
  });

  it("does NOT count weight gained on a fat-loss goal as progress", () => {
    const p = computeGoalProgress(79, 80, 73);
    expect(p.progressKg).toBe(0);
    expect(p.movedAwayKg).toBeCloseTo(1, 5);
    expect(p.percentage).toBe(0);
    expect(p.remainingKg).toBeCloseTo(7, 5);
  });

  it("handles a gain goal in the right direction", () => {
    const p = computeGoalProgress(60, 62, 66);
    expect(p.isGaining).toBe(true);
    expect(p.progressKg).toBeCloseTo(2, 5);
    expect(p.remainingKg).toBeCloseTo(4, 5);
    expect(p.percentage).toBeCloseTo((2 / 6) * 100, 5);
  });

  it("does NOT count weight lost on a gain goal as progress", () => {
    const p = computeGoalProgress(60, 59, 66);
    expect(p.progressKg).toBe(0);
    expect(p.movedAwayKg).toBeCloseTo(1, 5);
  });

  it("marks the goal reached at or past the target, with nothing left to go", () => {
    const p = computeGoalProgress(79, 72.5, 73);
    expect(p.reached).toBe(true);
    expect(p.remainingKg).toBe(0);
    expect(p.percentage).toBe(100);
  });

  it("shows zero progress on the starting day", () => {
    const p = computeGoalProgress(79, 79, 73);
    expect(p.progressKg).toBe(0);
    expect(p.movedAwayKg).toBe(0);
    expect(p.percentage).toBe(0);
    expect(p.reached).toBe(false);
  });

  describe("start equals target (maintenance)", () => {
    it("is at target when current matches", () => {
      const p = computeGoalProgress(70, 70, 70);
      expect(p.isMaintenance).toBe(true);
      expect(p.reached).toBe(true);
      expect(p.remainingKg).toBe(0);
      expect(p.percentage).toBe(0);
    });

    it("reports distance, never 'lost', when below target", () => {
      const p = computeGoalProgress(70, 69, 70);
      expect(p.progressKg).toBe(0);
      expect(p.movedAwayKg).toBeCloseTo(1, 5);
      expect(p.remainingKg).toBeCloseTo(1, 5);
      expect(p.reached).toBe(false);
    });

    it("reports distance when above target", () => {
      const p = computeGoalProgress(70, 71.5, 70);
      expect(p.movedAwayKg).toBeCloseTo(1.5, 5);
      expect(p.reached).toBe(false);
    });
  });

  it("marks a gain goal reached when current overshoots the target", () => {
    const p = computeGoalProgress(60, 67, 66);
    expect(p.reached).toBe(true);
    expect(p.remainingKg).toBe(0);
    expect(p.percentage).toBe(100);
  });
});

describe("pickCurrentWeight", () => {
  const goal = { startDate: "2026-10-01T00:00:00.000Z", startValue: 76.2 };

  it("uses the latest weigh-in when it is on or after the goal start", () => {
    expect(
      pickCurrentWeight({ latestWeighIn: { weightKg: 75.4, date: "2026-10-08" }, profileWeightKg: 79, goal })
    ).toBe(75.4);
    expect(
      pickCurrentWeight({ latestWeighIn: { weightKg: 76.2, date: "2026-10-01" }, profileWeightKg: 79, goal })
    ).toBe(76.2);
  });

  it("ignores a weigh-in from before the goal started (uses the goal's start)", () => {
    // Old log at 79 kg; a new goal started later at 76.2 kg.
    expect(
      pickCurrentWeight({ latestWeighIn: { weightKg: 79, date: "2026-09-20" }, profileWeightKg: 79, goal })
    ).toBe(76.2);
  });

  it("falls back to the profile weight with no weigh-ins", () => {
    expect(pickCurrentWeight({ latestWeighIn: null, profileWeightKg: 79, goal })).toBe(79);
  });

  it("uses the latest weigh-in when there is no goal", () => {
    expect(
      pickCurrentWeight({ latestWeighIn: { weightKg: 75, date: "2026-01-01" }, profileWeightKg: 79, goal: null })
    ).toBe(75);
  });

  it("returns null when nothing is known", () => {
    expect(pickCurrentWeight({ latestWeighIn: null, profileWeightKg: null, goal: null })).toBeNull();
  });
});
