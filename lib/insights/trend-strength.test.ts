import { describe, it, expect } from "vitest";
import { smoothedTrend, splitByGaps, summarizeWeight } from "@/lib/insights/trend";
import { epley, strengthDirection, topLifts, type StrengthSet } from "@/lib/insights/strength";

describe("summarizeWeight", () => {
  it("reports change and a least-squares rate per week", () => {
    const pts = [
      { date: "2026-09-01", weightKg: 84 },
      { date: "2026-09-08", weightKg: 83.6 },
      { date: "2026-09-15", weightKg: 83.2 },
      { date: "2026-09-22", weightKg: 82.8 },
    ];
    expect(summarizeWeight(pts)).toMatchObject({ start: 84, end: 82.8, change: -1.2, ratePerWeek: -0.4, spanDays: 21, weighIns: 4, plateau: false });
  });

  it("gives no rate for too few or too close weigh-ins", () => {
    expect(summarizeWeight([{ date: "2026-09-01", weightKg: 80 }])).toBeNull();
    expect(summarizeWeight([{ date: "2026-09-01", weightKg: 80 }, { date: "2026-09-20", weightKg: 79 }])?.ratePerWeek).toBeNull();
    expect(summarizeWeight([
      { date: "2026-09-01", weightKg: 80 }, { date: "2026-09-03", weightKg: 79.8 }, { date: "2026-09-05", weightKg: 79.9 },
    ])?.ratePerWeek).toBeNull();
  });

  it("detects a plateau (flat for 3+ weeks) through daily noise", () => {
    const noisy = [80.2, 79.6, 80.4, 79.9, 80.1, 79.8, 80.3, 80.0].map((w, i) => ({
      date: `2026-09-${String(1 + i * 3).padStart(2, "0")}`,
      weightKg: w,
    }));
    expect(summarizeWeight(noisy)?.plateau).toBe(true);
  });
});

describe("smoothedTrend / splitByGaps", () => {
  it("smooths noise and never bridges a 14-day gap", () => {
    const pts = [
      { date: "2026-08-01", weightKg: 80 },
      { date: "2026-08-02", weightKg: 81.2 }, // salty dinner
      { date: "2026-08-03", weightKg: 79.8 },
      { date: "2026-08-20", weightKg: 78 }, // after a 17-day gap
    ];
    expect(splitByGaps(pts).map((s) => s.length)).toEqual([3, 1]);
    const t = smoothedTrend(pts);
    expect(t[0].trendKg).toBe(80);
    expect(t[1].trendKg).toBeGreaterThan(80);
    expect(t[1].trendKg).toBeLessThan(81.2); // a spike only nudges the line
    expect(t[3].trendKg).toBe(78); // new segment restarts at the reading
  });
});

describe("epley", () => {
  it("estimates a one-rep max, and refuses what it can't estimate", () => {
    expect(epley(70, 8)).toBe(88.7);
    expect(epley(70, 11)).toBe(95.7);
    expect(epley(100, 1)).toBe(100);
    expect(epley(60, 13)).toBeNull();
    expect(epley(0, 5)).toBeNull();
    expect(epley(60, 0)).toBeNull();
  });
});

describe("topLifts", () => {
  const set = (date: string, sessionId: string, exerciseId: string, weight: number, reps: number): StrengthSet => ({
    date, sessionId, exerciseId, exerciseName: exerciseId === "b" ? "Bench" : "Squat", weight, reps,
  });

  it("uses each session's best set, compares first vs last session of the same lift", () => {
    const lifts = topLifts([
      set("2026-01-05", "s1", "b", 60, 8), set("2026-01-05", "s1", "b", 62.5, 5),
      set("2026-06-05", "s2", "b", 70, 8),
      set("2026-12-05", "s3", "b", 80, 8),
      set("2026-01-06", "s4", "q", 80, 5), // only one squat session → not shown
    ]);
    expect(lifts).toHaveLength(1);
    expect(lifts[0]).toMatchObject({ exerciseId: "b", sessions: 3, first: { date: "2026-01-05", e1rm: 76 }, last: { date: "2026-12-05", e1rm: 101.3 }, changePct: 33 });
  });

  it("two sessions on one day count as one day (best set), whatever order the rows arrive in", () => {
    const rows = [
      set("2026-03-02", "am", "b", 60, 5), set("2026-03-02", "pm", "b", 70, 5),
      set("2026-03-09", "s9", "b", 65, 5),
    ];
    const a = topLifts(rows);
    const b = topLifts([...rows].reverse());
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ sessions: 2, first: { date: "2026-03-02", e1rm: 81.7 }, last: { date: "2026-03-09", e1rm: 75.8 } });
  });

  it("ranks by sessions and caps the list", () => {
    const sets: StrengthSet[] = [];
    for (let i = 0; i < 4; i++) sets.push(set(`2026-02-0${i + 1}`, `b${i}`, "b", 60 + i, 5));
    for (let i = 0; i < 2; i++) sets.push(set(`2026-02-0${i + 1}`, `q${i}`, "q", 100 + i, 5));
    expect(topLifts(sets).map((l) => l.exerciseId)).toEqual(["b", "q"]);
    expect(topLifts(sets, 1)).toHaveLength(1);
  });

  it("strengthDirection uses the median change", () => {
    const l = (changePct: number) => ({ changePct }) as never;
    expect(strengthDirection([])).toBeNull();
    expect(strengthDirection([l(10), l(3), l(-1)])).toBe("UP");
    expect(strengthDirection([l(1), l(-1)])).toBe("FLAT");
    expect(strengthDirection([l(-5), l(-3)])).toBe("DOWN");
  });
});
