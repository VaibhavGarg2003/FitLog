/**
 * Profile Preferences API Route
 * ═════════════════════════════
 *
 * PATCH /api/profile/preferences — update preference-only fields
 *
 * WHY A SEPARATE ROUTE FROM PUT /api/profile:
 * ───────────────────────────────────────────
 * PUT /api/profile reruns the calorie engine and rewrites the user's nutrition
 * targets every time it is called. A preference (today: timezone) has nothing
 * to do with targets — sending it through PUT would recalculate, and possibly
 * change, someone's calories because their phone crossed a timezone.
 *
 * Today's only caller is components/shared/timezone-sync.tsx, which sends
 * `onlyIfUnset: true` — the database only writes the zone if none is stored
 * (fillTimezoneIfUnset), so a late or duplicate sync can never overwrite one.
 * Without that flag the zone is replaced; that path is for a future,
 * deliberate Settings control.
 *
 * RESPONSE: { success: true, applied } — applied is false when onlyIfUnset
 * found a zone already stored (not an error: there was nothing to fill).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import {
  fillTimezoneIfUnset,
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

    const { onlyIfUnset, ...preferences } = parsed.data;

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
