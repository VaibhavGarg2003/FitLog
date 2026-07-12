/**
 * Profile API Route
 * ═════════════════
 *
 * GET  /api/profile — returns current user's profile data
 * PUT  /api/profile — updates profile and recalculates targets (Step 3)
 *
 * Used by the dashboard header, settings page, and any component
 * that needs to display user info.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/supabase/server";
import { getUserProfile, recalculateProfile } from "@/lib/services/profile.service";
import { updateProfileSchema } from "@/lib/validators/api.schema";
import { handleRouteError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const profile = await getUserProfile(userId);

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found", isOnboarded: false },
        { status: 404 }
      );
    }

    return NextResponse.json(profile);
  } catch (error) {
    return handleRouteError(error, "GET /api/profile");
  }
}

/**
 * PUT /api/profile — Update profile and recalculate targets
 *
 * Called from the Settings page when user changes weight, goal,
 * activity level, or dietary type. Reruns the calorie engine
 * and saves new targets to the database.
 *
 * The engine is called inside recalculateProfile() (profile.service.ts):
 *   → calculateFullProfile() (tdee.ts — Step 2)
 *     → tiered protein multiplier (Step 2 fix)
 *     → dietaryType adjustment (Step 3)
 *   → updateProfile() (profile.repository.ts — Step 2)
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid profile data",
          details: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await recalculateProfile(userId, parsed.data);

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error, "PUT /api/profile");
  }
}

