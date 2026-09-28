/**
 * POST /api/insights/generate — each service outcome maps to its own status
 * so the client can tell "wait", "limit reached" and "try later" apart.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { UpstreamError, ValidationError } from "@/lib/utils/errors";

const getAuthUserId = vi.hoisted(() => vi.fn());
const generateReport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ getAuthUserId }));
vi.mock("@/lib/services/insight.service", () => ({ generateReport }));

import { POST, maxDuration } from "@/app/api/insights/generate/route";
import { LEASE_SECONDS, REPORT_AI_TIMEOUTS_MS, REPORT_ROUTE_MAX_SECONDS } from "@/lib/insights/report-budget";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/insights/generate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUserId.mockResolvedValue("u1");
});

describe("POST /api/insights/generate", () => {
  it("time budget: AI chain < route maxDuration < lease (a live request never loses its lease)", () => {
    const chainSeconds = Object.values(REPORT_AI_TIMEOUTS_MS).reduce((a, b) => a + b, 0) / 1000;
    expect(maxDuration).toBe(REPORT_ROUTE_MAX_SECONDS);
    expect(chainSeconds).toBeLessThan(maxDuration);
    expect(LEASE_SECONDS).toBeGreaterThan(maxDuration);
  });

  it("401 without a session, and never reaches the service", async () => {
    getAuthUserId.mockResolvedValue(null);
    expect((await POST(req({ type: "WEEK" }))).status).toBe(401);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it("400 for a bad body or unknown type", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ type: "DAY" }))).status).toBe(400);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it("passes only the type and the regenerate flag to the service", async () => {
    generateReport.mockResolvedValue({ status: "READY", report: { content: "hi" } });
    const res = await POST(req({ type: "MONTH", regenerate: true, periodStart: "2020-01-01" }));
    expect(res.status).toBe(200);
    expect(generateReport).toHaveBeenCalledWith("u1", "MONTH", { regenerate: true });
  });

  it.each([
    [{ status: "GENERATING" }, 202],
    [{ status: "LIMIT", report: null }, 409],
    [{ status: "RATE_LIMITED", resetAt: null }, 429],
  ])("maps %o to %i", async (result, status) => {
    generateReport.mockResolvedValue(result);
    const res = await POST(req({ type: "WEEK" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ status: result.status });
  });

  it("400 with the reason when the period is not available", async () => {
    generateReport.mockRejectedValue(new ValidationError("Your first weekly report will be ready on 2026-10-05."));
    const res = await POST(req({ type: "WEEK" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("2026-10-05");
  });

  it("502 when the AI providers fail", async () => {
    generateReport.mockRejectedValue(new UpstreamError("The AI coach couldn't be reached."));
    expect((await POST(req({ type: "WEEK" }))).status).toBe(502);
  });
});
