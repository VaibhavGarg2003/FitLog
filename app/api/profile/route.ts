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
import { getAuthUserId } from "@/lib/supabase/server";
import { getUserProfile, recalculateProfile } from "@/lib/services/profile.service";

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
    console.error("[GET /api/profile] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

    const body = await request.json();

    const updated = await recalculateProfile(userId, {
      weightKg: body.weightKg,
      activityLevel: body.activityLevel,
      goal: body.goal,
      dietaryType: body.dietaryType,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PUT /api/profile] Error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

