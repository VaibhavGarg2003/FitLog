/**
 * Weekly insight POST — a cache hit must never spend rate-limit quota.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getAuthUserId = vi.hoisted(() => vi.fn());
const getCachedWeeklyInsight = vi.hoisted(() => vi.fn());
const generateWeeklyInsight = vi.hoisted(() => vi.fn());
const checkInsightLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ getAuthUserId }));
vi.mock("@/lib/services/ai.service", () => ({
  getCachedWeeklyInsight,
  generateWeeklyInsight,
}));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkInsightLimit }));

import { POST } from "@/app/api/ai/weekly-insight/route";

const req = () =>
  new NextRequest("http://localhost/api/ai/weekly-insight?date=2026-10-08", {
    method: "POST",
  });

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUserId.mockResolvedValue("u1");
  checkInsightLimit.mockResolvedValue({ limited: false });
  generateWeeklyInsight.mockResolvedValue({ insight: "new", cached: false });
});

describe("POST /api/ai/weekly-insight", () => {
  it("returns a cached insight without consulting the rate limiter", async () => {
    getCachedWeeklyInsight.mockResolvedValue({ insight: "saved", cached: true });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ generated: true, insight: "saved" });
    expect(checkInsightLimit).not.toHaveBeenCalled();
    expect(generateWeeklyInsight).not.toHaveBeenCalled();
  });

  it("meters and generates on a cache miss, passing the client date through", async () => {
    getCachedWeeklyInsight.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(getCachedWeeklyInsight).toHaveBeenCalledWith("u1", "2026-10-08");
    expect(checkInsightLimit).toHaveBeenCalledTimes(1);
    expect(generateWeeklyInsight).toHaveBeenCalledWith("u1", "2026-10-08");
  });

  it("still returns 429 when the limit is reached on a miss", async () => {
    getCachedWeeklyInsight.mockResolvedValue(null);
    checkInsightLimit.mockResolvedValue({ limited: true, remaining: 0 });

    const res = await POST(req());

    expect(res.status).toBe(429);
    expect(generateWeeklyInsight).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before any lookup", async () => {
    getAuthUserId.mockResolvedValue(null);

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(getCachedWeeklyInsight).not.toHaveBeenCalled();
    expect(checkInsightLimit).not.toHaveBeenCalled();
  });
});
