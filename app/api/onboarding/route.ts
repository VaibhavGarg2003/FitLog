/**
 * Onboarding API Route
 * ════════════════════
 *
 * POST /api/onboarding
 *
 * Called when user completes the 5-step onboarding wizard.
 * Validates input, creates User + Profile, calculates TDEE.
 *
 * SECURITY:
 * ─────────
 * Uses createClient() from server.ts to read the session cookie.
 * If no valid session → 401 Unauthorized.
 * The user ID comes from the SESSION, not the request body.
 * This prevents users from creating profiles for other users.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validators/onboarding.schema";
import { completeOnboarding } from "@/lib/services/profile.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: Request) {
  try {
    // 1. Authenticate — who is making this request?
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();

    // 3. Validate with Zod
    const validation = onboardingSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // 4. Call the service layer (business logic)
    const result = await completeOnboarding(
      {
        id: user.id,
        email: user.email ?? "",
        user_metadata: user.user_metadata as Record<string, string> | undefined,
      },
      validation.data
    );

    // 5. Return success
    return NextResponse.json(
      {
        success: true,
        profile: result.profile,
        calculated: result.calculated,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, "POST /api/onboarding");
  }
}
