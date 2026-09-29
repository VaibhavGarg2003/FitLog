/**
 * Profile Preferences API Route
 * ═════════════════════════════
 *
 * PATCH /api/profile/preferences — update preference-only fields
 *
 * WHY A SEPARATE ROUTE FROM PUT /api/profile:
 * ───────────────────────────────────────────
 * PUT /api/profile reruns the calorie engine and rewrites the user's nutrition
 * targets every time it is called. A preference (timezone, report plan) has nothing
 * to do with targets — sending it through PUT would recalculate, and possibly
 * change, someone's calories because their phone crossed a timezone.
 *
 * Three write modes for `timezone`:
 *   - `onlyIfUnset: true` — components/shared/timezone-sync.tsx fills a
 *     missing zone; the database writes only if none is stored.
 *   - `expectedTimezone` — a deliberate change (the "you moved" prompt, the
 *     Settings picker), applied only if the stored zone is still the one the
 *     user saw; otherwise 409, so a stale screen never overwrites a newer
 *     choice from another device.
 *   - neither — unconditional replace (no UI caller).
 *
 * `insightPlan` (Settings → Coach check-ins: WEEKLY_AND_MONTHLY | MONTHLY_ONLY)
 * is a plain replace and must come in its own request (the schema rejects it
 * alongside the timezone write modes).
 *
 * RESPONSE: { success: true, applied } — applied is false when onlyIfUnset
 * found a zone already stored (not an error: there was nothing to fill).
 * 409 when expectedTimezone no longer matches.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  fillTimezoneIfUnset,
  replaceTimezoneIf,
  updatePreferences,
} from "@/lib/repositories/profile.repository";
import { updatePreferencesSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updatePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid preferences",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const { onlyIfUnset, expectedTimezone, ...preferences } = parsed.data;

    // Deliberate change with compare-and-set (prompt / Settings picker).
    if (expectedTimezone !== undefined && preferences.timezone) {
      const result = await replaceTimezoneIf(
        userId,
        preferences.timezone,
        expectedTimezone
      );
      if (result === "no-profile") {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      if (result === "conflict") {
        return NextResponse.json(
          { error: "Your time zone was changed on another device. Reload to see it." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, applied: true });
    }

    if (onlyIfUnset && preferences.timezone) {
      const result = await fillTimezoneIfUnset(userId, preferences.timezone);
      if (result === "no-profile") {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, applied: result === "filled" });
    }

    const updated = await updatePreferences(userId, preferences);
    if (!updated) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, applied: true });
  } catch (error) {
    return handleRouteError(error, "PATCH /api/profile/preferences");
  }
}
