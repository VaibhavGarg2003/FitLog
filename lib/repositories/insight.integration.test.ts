/**
 * AI report lease — live Postgres integration
 * ════════════════════════════════════════════
 *
 * The lease is one atomic INSERT … ON CONFLICT DO UPDATE … WHERE, and only a
 * real database can prove it: two racing requests get ONE lease, a live lease
 * blocks, an expired one can be taken over, attempts stop at the cap, only the
 * lease holder can save, and a failure gives the row back (with a refund).
 * The last block runs generateReport end-to-end on the real repository with
 * the AI mocked, including two users tapping "Write" at the same moment.
 *
 * HOW TO RUN (skipped when TEST_DATABASE_URL is unset) — same setup as
 * session-activity.integration.test.ts:
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npm test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { PeriodRows } from "@/lib/insights/facts";

const TEST_URL = process.env.TEST_DATABASE_URL;

const runWithFallback = vi.hoisted(() => vi.fn());
const data = vi.hoisted(() => ({ loadInsightUser: vi.fn(), loadPeriodRows: vi.fn() }));
vi.mock("@/lib/ai/fallback", () => ({ runWithFallback }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkReportLimit: async () => ({ limited: false, metered: true }) }));
vi.mock("@/lib/services/insight-data.service", () => data);

describe.skipIf(!TEST_URL)("period insight lease (integration)", () => {
  let prisma: PrismaClient;
  let repo: typeof import("./insight.repository");
  let svc: typeof import("@/lib/services/insight.service");
  const userId = crypto.randomUUID();
  const range = { coveredStart: "2026-09-21", periodEnd: "2026-09-27", partial: false };
  const keyFor = (type: "WEEK" | "MONTH" | "QUARTER" | "YEAR", periodStart: string) => ({ userId, type, periodStart });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL!;
    vi.resetModules();
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    prisma = (await import("@/lib/supabase/prisma")).prisma;
    repo = await import("./insight.repository");
    svc = await import("@/lib/services/insight.service");
    await prisma.user.create({ data: { id: userId, email: `${userId}@lease.invalid` } });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { id: userId } }); // cascades period_insights
    await prisma?.$disconnect();
  });

  it("two racing requests get exactly one lease", async () => {
    const key = keyFor("WEEK", "2026-09-21");
    const results = await Promise.all(Array.from({ length: 6 }, () => repo.acquireLease({ ...key, ...range }, 2)));
    const won = results.filter(Boolean);
    expect(won).toHaveLength(1);
    expect(won[0]!.attempts).toBe(1);
  });

  it("a live lease blocks; an expired one can be taken over (attempt 2), then the cap holds", async () => {
    const key = keyFor("WEEK", "2026-09-21");
    expect(await repo.acquireLease({ ...key, ...range }, 2)).toBeNull();

    await prisma.$executeRaw`UPDATE period_insights SET lease_expires_at = now() - interval '1 second'
      WHERE user_id = ${userId} AND period_type = 'WEEK'`;
    const second = await repo.acquireLease({ ...key, ...range }, 2);
    expect(second?.attempts).toBe(2);

    await prisma.$executeRaw`UPDATE period_insights SET lease_expires_at = now() - interval '1 second'
      WHERE user_id = ${userId} AND period_type = 'WEEK'`;
    expect(await repo.acquireLease({ ...key, ...range }, 2)).toBeNull(); // attempts used up
  });

  it("only the lease holder can save; the saved row is READY and unleased", async () => {
    const key = keyFor("MONTH", "2026-08-01");
    const lease = (await repo.acquireLease({ ...key, coveredStart: "2026-08-01", periodEnd: "2026-08-31", partial: false }, 2))!;
    const payload = {
      content: "August went well.", highlights: ["a"], suggestion: "b", facts: { x: 1 },
      factsHash: "h", provider: "gemini", statsVersion: 1, promptVersion: 1,
    };
    expect(await repo.completeLease(key, "not-my-token", payload)).toBe(false);
    expect(await repo.completeLease(key, lease.token, payload)).toBe(true);

    const row = (await repo.findReport(key))!;
    expect(row).toMatchObject({ status: "READY", content: "August went well.", leaseToken: null, leaseExpiresAt: null, legacy: false });
    expect(row.periodStart.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect((await repo.listReports(userId)).map((r) => r.periodType)).toContain("MONTH");
  });

  it("a failure gives the row back: READY keeps the old text, FAILED when there is none; refund returns the attempt", async () => {
    const month = keyFor("MONTH", "2026-08-01");
    const again = (await repo.acquireLease({ ...month, coveredStart: "2026-08-01", periodEnd: "2026-08-31", partial: false }, 2))!;
    expect(again.attempts).toBe(2);
    await repo.abandonLease(month, again.token, true);
    expect(await repo.findReport(month)).toMatchObject({ status: "READY", content: "August went well.", attempts: 1 });

    const q = keyFor("QUARTER", "2026-07-01");
    const lease = (await repo.acquireLease({ ...q, coveredStart: "2026-07-01", periodEnd: "2026-09-30", partial: false }, 2))!;
    await repo.abandonLease(q, "wrong-token", true); // no-op
    expect((await repo.findReport(q))!.status).toBe("GENERATING");
    await repo.abandonLease(q, lease.token, false);
    expect(await repo.findReport(q)).toMatchObject({ status: "FAILED", attempts: 1, leaseToken: null });
  });

  it("generateReport end-to-end: two simultaneous taps → one AI call, one saved report", async () => {
    const other = crypto.randomUUID();
    await prisma.user.create({ data: { id: other, email: `${other}@lease.invalid` } });
    try {
      const food = (date: string) => ({ date, calories: 1900, protein: 110, carbs: 200, fat: 60 });
      const rows: PeriodRows = {
        nutrition: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map(food),
        workouts: [{ date: "2026-09-22", sessions: 1 }],
        weights: [],
        sets: [],
        revisions: [],
      };
      data.loadInsightUser.mockResolvedValue({
        userId: other, timeZone: "UTC", today: "2026-09-28", accountStart: "2026-06-01",
        insightPlan: "WEEKLY_AND_MONTHLY",
        ctx: { goal: null, fitnessGoal: null, strictness: "MODERATE", dietaryType: null },
      });
      data.loadPeriodRows.mockResolvedValue(rows);
      runWithFallback.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true, provider: "groq", attempts: [], text: JSON.stringify({ insight: "Four days logged.", highlights: [], suggestion: "Log dinner too." }) };
      });

      const [a, b] = await Promise.all([svc.generateReport(other, "WEEK"), svc.generateReport(other, "WEEK")]);
      expect([a.status, b.status].sort()).toEqual(["GENERATING", "READY"]);
      expect(runWithFallback).toHaveBeenCalledTimes(1);

      // A third tap after it's saved is free: the stored copy, no AI.
      const c = await svc.generateReport(other, "WEEK");
      expect(c.status).toBe("READY");
      expect(runWithFallback).toHaveBeenCalledTimes(1);

      const overview = await svc.getInsightsOverview(other);
      expect(overview.cards.find((x) => x.type === "WEEK")).toMatchObject({ state: "READY", stale: false, attemptsLeft: 1 });
    } finally {
      await prisma.user.deleteMany({ where: { id: other } });
    }
  });
});
