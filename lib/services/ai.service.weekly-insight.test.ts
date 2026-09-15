/**
 * Weekly insight data gathering — range queries, not a per-day loop.
 *
 * The LLM and the database are mocked. These tests lock the part this change
 * touched: which date ranges are requested (once each), how missing days are
 * filled, and what numbers reach the prompt and the saved metadata.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const runWithFallback = vi.hoisted(() => vi.fn());
const getDailyNutritionInRange = vi.hoisted(() => vi.fn());
const getDailyWorkoutsInRange = vi.hoisted(() => vi.fn());
const getWeightLogsInRange = vi.hoisted(() => vi.fn());
const getProfileByUserId = vi.hoisted(() => vi.fn());
const getInsightForWeek = vi.hoisted(() => vi.fn());
const saveInsight = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/fallback", () => ({ runWithFallback }));
vi.mock("@/lib/repositories/analytics.repository", () => ({
  getDailyNutritionInRange,
  getDailyWorkoutsInRange,
  getWeightLogsInRange,
}));
vi.mock("@/lib/repositories/profile.repository", () => ({ getProfileByUserId }));
vi.mock("@/lib/repositories/insight.repository", () => ({
  getInsightForWeek,
  saveInsight,
}));

import { generateWeeklyInsight } from "@/lib/services/ai.service";

const PROFILE = {
  goal: "LOSE_FAT",
  targetCalories: 1800,
  targetProtein: 140,
  targetCarbs: 180,
  targetFat: 55,
  weightKg: 84,
  strictness: "MODERATE",
  dietaryType: "NON_VEG",
};

beforeEach(() => {
  vi.clearAllMocks();
  getInsightForWeek.mockResolvedValue(null);
  getProfileByUserId.mockResolvedValue(PROFILE);
  saveInsight.mockResolvedValue({});
  runWithFallback.mockResolvedValue({
    ok: true,
    provider: "gemini",
    text: JSON.stringify({ insight: "Good week.", highlights: ["a", "b", "c"], suggestion: "More protein." }),
  });
  getDailyNutritionInRange.mockResolvedValue([
    { date: "2026-10-05", calories: 1900, protein: 120, carbs: 200, fat: 60 },
    { date: "2026-10-07", calories: 1700, protein: 140, carbs: 170, fat: 50 },
  ]);
  getDailyWorkoutsInRange.mockResolvedValue([{ date: "2026-10-06", sessions: 2 }]);
  getWeightLogsInRange.mockResolvedValue([
    { date: "2026-09-29", weightKg: 85 },
    { date: "2026-10-11", weightKg: 84.2 },
  ]);
});

describe("generateWeeklyInsight — data gathering", () => {
  it("asks for the Monday–Sunday week once per data type", async () => {
    await generateWeeklyInsight("u1", "2026-10-08"); // a Thursday

    expect(getDailyNutritionInRange).toHaveBeenCalledTimes(1);
    expect(getDailyNutritionInRange).toHaveBeenCalledWith("u1", "2026-10-05", "2026-10-11");
    expect(getDailyWorkoutsInRange).toHaveBeenCalledTimes(1);
    expect(getDailyWorkoutsInRange).toHaveBeenCalledWith("u1", "2026-10-05", "2026-10-11");
  });

  it("bounds the weight trend to the 14 calendar days ending on Sunday", async () => {
    await generateWeeklyInsight("u1", "2026-10-08");
    expect(getWeightLogsInRange).toHaveBeenCalledTimes(1);
    expect(getWeightLogsInRange).toHaveBeenCalledWith("u1", "2026-09-28", "2026-10-11");
  });

  it("puts all 7 days in the prompt, filling gaps with zeros", async () => {
    await generateWeeklyInsight("u1", "2026-10-08");
    const prompt: string = runWithFallback.mock.calls[0][0].userMessage;

    expect(prompt).toContain("This Week's Data (2026-10-05 to 2026-10-11)");
    expect(prompt).toContain("2026-10-05: 1900 kcal / 120g protein / 0 workout(s)");
    expect(prompt).toContain("2026-10-06: 0 kcal / 0g protein / 2 workout(s)");
    expect(prompt).toContain("2026-10-07: 1700 kcal / 140g protein / 0 workout(s)");
    expect(prompt).toContain("2026-10-11: 0 kcal / 0g protein / 0 workout(s)");
    expect(prompt.match(/^2026-10-\d\d: /gm)).toHaveLength(7);
  });

  it("computes the same summary numbers as before", async () => {
    await generateWeeklyInsight("u1", "2026-10-08");
    const metadata = saveInsight.mock.calls[0][1].metadata;

    expect(metadata).toMatchObject({
      daysLogged: 2,
      avgCalories: 1800, // (1900 + 1700) / 2
      avgProtein: 130,
      totalWorkouts: 1, // days trained, not sessions
      weeklyWeightChange: -0.8, // 84.2 − 85
    });
  });

  it("reports no weight change with fewer than two weigh-ins", async () => {
    getWeightLogsInRange.mockResolvedValue([{ date: "2026-10-11", weightKg: 84 }]);
    await generateWeeklyInsight("u1", "2026-10-08");
    expect(saveInsight.mock.calls[0][1].metadata.weeklyWeightChange).toBeNull();
  });

  it("serves the cache without touching the database queries or the LLM", async () => {
    getInsightForWeek.mockResolvedValue({
      content: "cached",
      highlights: [],
      suggestion: "",
      provider: "groq",
    });
    const res = await generateWeeklyInsight("u1", "2026-10-08");

    expect(res.cached).toBe(true);
    expect(getDailyNutritionInRange).not.toHaveBeenCalled();
    expect(runWithFallback).not.toHaveBeenCalled();
  });
});
