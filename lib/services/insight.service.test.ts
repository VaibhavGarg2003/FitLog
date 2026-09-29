/**
 * AI reports — overview states and the generate flow.
 *
 * The database, the AI and the rate limiter are mocked: these tests lock what
 * OUR code decides — which period, whether a saved copy is returned for free,
 * when the lease is taken and given back, what reaches the model and what is
 * saved. "Today" is Monday 28 Sep 2026, so the last finished week is 21–27 Sep
 * and the last finished month is August.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PeriodRows } from "@/lib/insights/facts";
import type { InsightUser } from "@/lib/services/insight-data.service";

const runWithFallback = vi.hoisted(() => vi.fn());
const checkReportLimit = vi.hoisted(() => vi.fn());
const repo = vi.hoisted(() => ({
  findReport: vi.fn(),
  listReports: vi.fn(),
  acquireLease: vi.fn(),
  completeLease: vi.fn(),
  abandonLease: vi.fn(),
}));
const data = vi.hoisted(() => ({ loadInsightUser: vi.fn(), loadPeriodRows: vi.fn() }));

vi.mock("@/lib/ai/fallback", () => ({ runWithFallback }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkReportLimit }));
vi.mock("@/lib/repositories/insight.repository", () => repo);
vi.mock("@/lib/services/insight-data.service", () => data);

import {
  generateReport,
  getInsightsOverview,
  MAX_ATTEMPTS,
  REPORT_AI_TIMEOUTS_MS,
  STATS_VERSION,
} from "@/lib/services/insight.service";
import { UpstreamError, ValidationError } from "@/lib/utils/errors";

const TODAY = "2026-09-28";

function user(over: Partial<InsightUser> = {}): InsightUser {
  return {
    userId: "u1",
    timeZone: "Asia/Kolkata",
    today: TODAY,
    accountStart: "2026-06-01",
    insightPlan: "WEEKLY_AND_MONTHLY",
    ctx: { goal: null, fitnessGoal: "LOSE_FAT", strictness: "MODERATE", dietaryType: "VEG" },
    ...over,
  };
}

/** Food on 21–25 Sep (last week) and 14–16 Sep (the week before), a few workouts. */
function rows(): PeriodRows {
  const food = (date: string) => ({ date, calories: 2000, protein: 120, carbs: 200, fat: 60 });
  return {
    nutrition: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"].map(food),
    workouts: [{ date: "2026-09-22", sessions: 1 }, { date: "2026-09-24", sessions: 1 }],
    weights: [{ date: "2026-09-21", weightKg: 80 }, { date: "2026-09-27", weightKg: 79.6 }],
    sets: [],
    revisions: [{ effectiveFrom: "2026-06-01", targetCalories: 2100, targetProtein: 130 }],
  };
}

/** Rows are filtered to the requested range, like the real loader. */
function serveRows(all: PeriodRows) {
  data.loadPeriodRows.mockImplementation(async (_u: string, from: string, to: string) => {
    const inRange = (d: string) => d >= from && d <= to;
    return {
      nutrition: all.nutrition.filter((r) => inRange(r.date)),
      workouts: all.workouts.filter((r) => inRange(r.date)),
      weights: all.weights.filter((r) => inRange(r.date)),
      sets: all.sets.filter((r) => inRange(r.date)),
      revisions: all.revisions.filter((r) => r.effectiveFrom <= to),
    };
  });
}

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function savedWeek(over: Record<string, unknown> = {}) {
  return {
    periodType: "WEEK",
    periodStart: day("2026-09-21"),
    coveredStart: day("2026-09-21"),
    periodEnd: day("2026-09-27"),
    partial: false,
    status: "READY",
    leaseToken: null,
    leaseExpiresAt: null,
    attempts: 1,
    content: "Solid week.",
    highlights: ["5 days logged"],
    suggestion: "Keep going.",
    facts: null,
    factsHash: "x",
    statsVersion: STATS_VERSION,
    promptVersion: 1,
    provider: "gemini",
    legacy: false,
    generatedAt: new Date("2026-09-28T05:00:00Z"),
    ...over,
  };
}

function aiReply(payload: unknown) {
  runWithFallback.mockResolvedValue({ ok: true, text: JSON.stringify(payload), provider: "gemini", attempts: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  data.loadInsightUser.mockResolvedValue(user());
  serveRows(rows());
  repo.findReport.mockResolvedValue(null);
  repo.listReports.mockResolvedValue([]);
  repo.acquireLease.mockResolvedValue({ token: "t1", attempts: 1 });
  repo.completeLease.mockResolvedValue(true);
  repo.abandonLease.mockResolvedValue(undefined);
  checkReportLimit.mockResolvedValue({ limited: false, metered: true });
  aiReply({ insight: "Good week.", highlights: ["a", "b"], suggestion: "Add one walk." });
});

/** Make findReport return what completeLease saved (the post-save re-read). */
function persistOnComplete() {
  repo.completeLease.mockImplementation(async (_key: unknown, _t: string, saved: Record<string, unknown>) => {
    repo.findReport.mockResolvedValue(savedWeek({ ...saved, content: saved.content }));
    return true;
  });
}

describe("generateReport", () => {
  it("writes the last finished week from facts and saves it under the lease", async () => {
    persistOnComplete();
    const result = await generateReport("u1", "WEEK");

    expect(result.status).toBe("READY");
    expect(repo.acquireLease).toHaveBeenCalledWith(
      expect.objectContaining({ type: "WEEK", periodStart: "2026-09-21", coveredStart: "2026-09-21", periodEnd: "2026-09-27", partial: false }),
      MAX_ATTEMPTS
    );
    // The model gets the computed facts — including last week for comparison.
    const msg = runWithFallback.mock.calls[0][0].userMessage as string;
    expect(msg).toContain("21–27 Sep 2026");
    const facts = JSON.parse(msg.split("\n")[3]);
    expect(facts.coverage.foodDays).toBe(5);
    expect(facts.previous).not.toBeNull();
    // Reports get their own, longer AI budget (see report-budget.ts).
    expect(runWithFallback.mock.calls[0][0].timeoutsMs).toEqual(REPORT_AI_TIMEOUTS_MS);
    // Saved only with our token, with the fingerprint and versions.
    const [, token, saved] = repo.completeLease.mock.calls[0];
    expect(token).toBe("t1");
    expect(saved).toMatchObject({ content: "Good week.", suggestion: "Add one walk.", provider: "gemini", statsVersion: STATS_VERSION });
    expect(saved.factsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a saved, up-to-date report for free (no lease, no AI, no limit)", async () => {
    persistOnComplete();
    await generateReport("u1", "WEEK");
    vi.clearAllMocks();
    checkReportLimit.mockResolvedValue({ limited: false, metered: true });

    const again = await generateReport("u1", "WEEK");
    expect(again.status).toBe("READY");
    expect(repo.acquireLease).not.toHaveBeenCalled();
    expect(runWithFallback).not.toHaveBeenCalled();
    expect(checkReportLimit).not.toHaveBeenCalled();
  });

  it("regenerates when the period's data changed after the report was written", async () => {
    repo.findReport.mockResolvedValue(savedWeek({ factsHash: "old-numbers" }));
    await generateReport("u1", "WEEK");
    expect(repo.acquireLease).toHaveBeenCalled();
    expect(runWithFallback).toHaveBeenCalled();
  });

  it("reports GENERATING while another request holds a live lease", async () => {
    repo.findReport.mockResolvedValue(
      savedWeek({ status: "GENERATING", content: null, leaseExpiresAt: new Date(Date.now() + 30_000) })
    );
    expect(await generateReport("u1", "WEEK")).toEqual({ status: "GENERATING" });
    expect(repo.acquireLease).not.toHaveBeenCalled();
  });

  it("reports LIMIT when the lease is refused and nobody is generating", async () => {
    repo.acquireLease.mockResolvedValue(null);
    repo.findReport
      .mockResolvedValueOnce(savedWeek({ factsHash: "old", attempts: 2 }))
      .mockResolvedValueOnce(savedWeek({ factsHash: "old", attempts: 2 }));
    const result = await generateReport("u1", "WEEK");
    expect(result.status).toBe("LIMIT");
    expect(runWithFallback).not.toHaveBeenCalled();
  });

  it("gives the lease back with a refund when every AI provider fails", async () => {
    runWithFallback.mockResolvedValue({ ok: false, attempts: [] });
    await expect(generateReport("u1", "WEEK")).rejects.toBeInstanceOf(UpstreamError);
    expect(repo.abandonLease).toHaveBeenCalledWith(expect.objectContaining({ type: "WEEK" }), "t1", true);
    expect(repo.completeLease).not.toHaveBeenCalled();
  });

  it("does NOT refund a failed try the backstop didn't meter (Redis down → fail open)", async () => {
    checkReportLimit.mockResolvedValue({ limited: false }); // failed open
    runWithFallback.mockResolvedValue({ ok: false, attempts: [] });
    await expect(generateReport("u1", "WEEK")).rejects.toBeInstanceOf(UpstreamError);
    expect(repo.abandonLease).toHaveBeenCalledWith(expect.anything(), "t1", false);
  });

  it("gives the lease back when the model's reply is not the expected JSON", async () => {
    runWithFallback.mockResolvedValue({ ok: true, text: "Sure! Here is your review…", provider: "groq", attempts: [] });
    await expect(generateReport("u1", "WEEK")).rejects.toBeInstanceOf(UpstreamError);
    expect(repo.abandonLease).toHaveBeenCalledWith(expect.anything(), "t1", true);
  });

  it("accepts a fenced JSON reply and caps highlights at three", async () => {
    runWithFallback.mockResolvedValue({
      ok: true,
      text: '```json\n{"insight":"Ok.","highlights":["1","2","3","4"],"suggestion":"x"}\n```',
      provider: "gemini",
      attempts: [],
    });
    persistOnComplete();
    await generateReport("u1", "WEEK");
    expect(repo.completeLease.mock.calls[0][2]).toMatchObject({ content: "Ok.", highlights: ["1", "2", "3"] });
  });

  it("stops at the 30-day backstop before calling the AI, refunding the attempt", async () => {
    checkReportLimit.mockResolvedValue({ limited: true, resetAt: new Date("2026-10-10T00:00:00Z") });
    const result = await generateReport("u1", "WEEK");
    expect(result).toEqual({ status: "RATE_LIMITED", resetAt: "2026-10-10T00:00:00.000Z" });
    expect(runWithFallback).not.toHaveBeenCalled();
    expect(repo.abandonLease).toHaveBeenCalledWith(expect.anything(), "t1", true);
  });

  it("refuses a weekly report on the monthly-only plan", async () => {
    data.loadInsightUser.mockResolvedValue(user({ insightPlan: "MONTHLY_ONLY" }));
    await expect(generateReport("u1", "WEEK")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.acquireLease).not.toHaveBeenCalled();
  });

  it("refuses a period with too little logged, without spending an attempt", async () => {
    // August has no rows at all.
    await expect(generateReport("u1", "MONTH")).rejects.toThrow(/Not enough logged in August 2026/);
    expect(repo.acquireLease).not.toHaveBeenCalled();
  });

  it("waits for a saved time zone before filing a report under a period", async () => {
    data.loadInsightUser.mockResolvedValue(user({ timeZone: null }));
    await expect(generateReport("u1", "WEEK")).rejects.toThrow(/time zone is still being set up/);
    expect(repo.acquireLease).not.toHaveBeenCalled();
  });

  it("tells a brand-new account when its first weekly report arrives", async () => {
    data.loadInsightUser.mockResolvedValue(user({ accountStart: "2026-09-24" }));
    await expect(generateReport("u1", "WEEK")).rejects.toThrow("ready on 2026-10-05");
  });
});

describe("getInsightsOverview", () => {
  it("shows each plan type with its state, and never calls the AI", async () => {
    const o = await getInsightsOverview("u1");
    const byType = Object.fromEntries(o.cards.map((c) => [c.type, c]));

    expect(o.cards.map((c) => c.type)).toEqual(["WEEK", "MONTH"]); // quarter/year hidden without data
    expect(byType.WEEK).toMatchObject({ state: "AVAILABLE", label: "21–27 Sep 2026", canGenerate: true, attemptsLeft: 2 });
    expect(byType.MONTH).toMatchObject({ state: "NOT_ENOUGH_DATA", label: "August 2026", canGenerate: false });
    expect(byType.MONTH.message).toMatch(/needs 7 days with food/);
    expect(o.firstWeek).toBeNull();
    expect(runWithFallback).not.toHaveBeenCalled();
    // One load covering every period shown.
    expect(data.loadPeriodRows).toHaveBeenCalledTimes(1);
  });

  it("drops the weekly card on the monthly-only plan", async () => {
    data.loadInsightUser.mockResolvedValue(user({ insightPlan: "MONTHLY_ONLY" }));
    const o = await getInsightsOverview("u1");
    expect(o.cards.map((c) => c.type)).toEqual(["MONTH"]);
  });

  it("gives a new account the free first-days card and a date for its first report", async () => {
    data.loadInsightUser.mockResolvedValue(user({ accountStart: "2026-09-24" }));
    const o = await getInsightsOverview("u1");
    expect(o.firstWeek?.from).toBe("2026-09-24");
    expect(o.firstWeek?.facts.coverage.foodDays).toBe(2); // 24–25 Sep
    const week = o.cards.find((c) => c.type === "WEEK")!;
    expect(week).toMatchObject({ state: "NOT_YET", canGenerate: false });
    expect(week.message).toContain("2026-10-05");
  });

  it("a report written by generate is NOT outdated in the overview (same fingerprint)", async () => {
    persistOnComplete();
    await generateReport("u1", "WEEK");
    const saved = repo.completeLease.mock.calls[0][2];
    repo.findReport.mockImplementation(async (k: { type: string }) =>
      k.type === "WEEK" ? savedWeek({ factsHash: saved.factsHash }) : null
    );

    const week = (await getInsightsOverview("u1")).cards.find((c) => c.type === "WEEK")!;
    expect(week).toMatchObject({ state: "READY", stale: false, canGenerate: false, attemptsLeft: 1 });
  });

  it("flags a report as outdated when the period's data changed", async () => {
    repo.findReport.mockImplementation(async (k: { type: string }) =>
      k.type === "WEEK" ? savedWeek({ factsHash: "old-numbers" }) : null
    );
    const week = (await getInsightsOverview("u1")).cards.find((c) => c.type === "WEEK")!;
    expect(week).toMatchObject({ state: "READY", stale: true, canGenerate: true });
  });

  it("an outdated report with no attempts left explains why it stays", async () => {
    repo.findReport.mockImplementation(async (k: { type: string }) =>
      k.type === "WEEK" ? savedWeek({ factsHash: "old-numbers", attempts: 2 }) : null
    );
    const week = (await getInsightsOverview("u1")).cards.find((c) => c.type === "WEEK")!;
    expect(week).toMatchObject({ stale: true, canGenerate: false, attemptsLeft: 0 });
    expect(week.message).toMatch(/regenerated twice/);
  });

  it("shows GENERATING while a lease is live, FAILED after a failed try", async () => {
    repo.findReport.mockResolvedValueOnce(
      savedWeek({ status: "GENERATING", content: null, leaseExpiresAt: new Date(Date.now() + 30_000) })
    );
    expect((await getInsightsOverview("u1")).cards[0].state).toBe("GENERATING");

    repo.findReport.mockImplementation(async (k: { type: string }) =>
      k.type === "WEEK" ? savedWeek({ status: "FAILED", content: null }) : null
    );
    expect((await getInsightsOverview("u1")).cards[0]).toMatchObject({ state: "FAILED", canGenerate: true });
  });

  it("labels an old week-so-far insight up to the day it was written, and omits archive facts", async () => {
    repo.listReports.mockResolvedValue([
      // 00:30 on 24 Sep in Kolkata is still 23 Sep in UTC — label by the user's day.
      savedWeek({ legacy: true, generatedAt: new Date("2026-09-23T19:00:00Z"), facts: { big: true } }),
      savedWeek({ periodType: "MONTH", periodStart: day("2026-08-01"), coveredStart: day("2026-08-01"), periodEnd: day("2026-08-31") }),
    ]);
    const { archive } = await getInsightsOverview("u1");
    expect(archive.map((r) => r.label)).toEqual(["21–24 Sep 2026 (week so far)", "August 2026"]);
    expect(archive.every((r) => r.facts === null)).toBe(true);
  });

  it("legacy weekly insights are READY, never outdated, and can be rewritten once", async () => {
    repo.findReport.mockImplementation(async (k: { type: string }) =>
      k.type === "WEEK" ? savedWeek({ legacy: true, factsHash: null, facts: { old: true } }) : null
    );
    const week = (await getInsightsOverview("u1")).cards.find((c) => c.type === "WEEK")!;
    expect(week).toMatchObject({ state: "READY", stale: false, canGenerate: true, attemptsLeft: 1 });
  });
});
