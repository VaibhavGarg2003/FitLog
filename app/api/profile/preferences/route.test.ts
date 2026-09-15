/**
 * PATCH /api/profile/preferences — the background sync may only FILL a
 * missing timezone; a deliberate call (no onlyIfUnset) replaces it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getAuthUserId = vi.hoisted(() => vi.fn());
const fillTimezoneIfUnset = vi.hoisted(() => vi.fn());
const updatePreferences = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({ getAuthUserId }));
vi.mock("@/lib/repositories/profile.repository", () => ({
  fillTimezoneIfUnset,
  updatePreferences,
}));

import { PATCH } from "@/app/api/profile/preferences/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/profile/preferences", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getAuthUserId.mockResolvedValue("u1");
  updatePreferences.mockResolvedValue(true);
});

describe("PATCH /api/profile/preferences", () => {
  it("fills through the conditional write when onlyIfUnset is set", async () => {
    fillTimezoneIfUnset.mockResolvedValue("filled");
    const res = await PATCH(req({ timezone: "Asia/Kolkata", onlyIfUnset: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, applied: true });
    expect(fillTimezoneIfUnset).toHaveBeenCalledWith("u1", "Asia/Kolkata");
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("reports applied: false — not an error — when a zone is already stored", async () => {
    fillTimezoneIfUnset.mockResolvedValue("already-set");
    const res = await PATCH(req({ timezone: "America/Los_Angeles", onlyIfUnset: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, applied: false });
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no profile", async () => {
    fillTimezoneIfUnset.mockResolvedValue("no-profile");
    expect((await PATCH(req({ timezone: "UTC", onlyIfUnset: true }))).status).toBe(404);

    updatePreferences.mockResolvedValue(false);
    expect((await PATCH(req({ timezone: "UTC" }))).status).toBe(404);
  });

  it("replaces the zone on a deliberate call, without passing the mode flag on", async () => {
    const res = await PATCH(req({ timezone: "Europe/London" }));

    expect(res.status).toBe(200);
    expect(updatePreferences).toHaveBeenCalledWith("u1", { timezone: "Europe/London" });
    expect(fillTimezoneIfUnset).not.toHaveBeenCalled();
  });

  it("rejects bad input and unauthenticated calls before any write", async () => {
    expect((await PATCH(req({ timezone: "+05:30" }))).status).toBe(400);
    expect((await PATCH(req("{not json"))).status).toBe(400);
    getAuthUserId.mockResolvedValue(null);
    expect((await PATCH(req({ timezone: "UTC" }))).status).toBe(401);
    expect(fillTimezoneIfUnset).not.toHaveBeenCalled();
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
