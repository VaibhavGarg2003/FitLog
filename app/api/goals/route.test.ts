/**
 * /api/goals — a goal change goes through the recalculating service, and the
 * optional device timezone is validated, never trusted blindly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getAuthUserId = vi.hoisted(() => vi.fn());
const setWeightGoal = vi.hoisted(() => vi.fn());
const removeWeightGoal = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ getAuthUserId }));
vi.mock("@/lib/services/profile.service", () => ({
  setWeightGoal,
  removeWeightGoal,
}));

import { POST, DELETE } from "@/app/api/goals/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/goals", {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const GOAL = { type: "LOSE_FAT", startValue: 84, targetValue: 76, timelineMonths: 4 };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUserId.mockResolvedValue("u1");
  setWeightGoal.mockResolvedValue({ goal: { id: "g1", ...GOAL }, profile: {} });
  removeWeightGoal.mockResolvedValue({ removed: 1, profile: {} });
});

describe("POST /api/goals", () => {
  it("sets the goal through the recalculating service with the device zone", async () => {
    const res = await POST(req("POST", { ...GOAL, timezone: "Asia/Kolkata" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "g1" });
    expect(setWeightGoal).toHaveBeenCalledWith("u1", GOAL, {
      deviceTimeZone: "Asia/Kolkata",
    });
  });

  it("drops an unrecognised zone instead of failing the save", async () => {
    const res = await POST(req("POST", { ...GOAL, timezone: "+05:30" }));
    expect(res.status).toBe(201);
    expect(setWeightGoal).toHaveBeenCalledWith("u1", GOAL, { deviceTimeZone: undefined });
  });

  it("defaults the timeline and rejects invalid goals before any write", async () => {
    const noTimeline = { type: GOAL.type, startValue: GOAL.startValue, targetValue: GOAL.targetValue };
    await POST(req("POST", noTimeline));
    expect(setWeightGoal).toHaveBeenLastCalledWith(
      "u1",
      { ...noTimeline, timelineMonths: 4 },
      { deviceTimeZone: undefined }
    );

    vi.clearAllMocks();
    getAuthUserId.mockResolvedValue("u1");
    expect((await POST(req("POST", { ...GOAL, targetValue: 5 }))).status).toBe(400);
    expect((await POST(req("POST", "{not json"))).status).toBe(400);
    expect(setWeightGoal).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    getAuthUserId.mockResolvedValue(null);
    expect((await POST(req("POST", GOAL))).status).toBe(401);
    expect(setWeightGoal).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/goals", () => {
  it("removes through the recalculating service, passing the device zone", async () => {
    const res = await DELETE(req("DELETE", { timezone: "Europe/London" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 1 });
    expect(removeWeightGoal).toHaveBeenCalledWith("u1", { deviceTimeZone: "Europe/London" });
  });

  it("still works for a client that sends no body", async () => {
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect(removeWeightGoal).toHaveBeenCalledWith("u1", { deviceTimeZone: undefined });
  });

  it("rejects unauthenticated requests", async () => {
    getAuthUserId.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"))).status).toBe(401);
    expect(removeWeightGoal).not.toHaveBeenCalled();
  });
});
