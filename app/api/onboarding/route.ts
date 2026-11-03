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

import { NextResponse, type NextRequest } from "next/server";
import { PENDING_INVITE_COOKIE, pendingInvitePath } from "@/lib/utils/pending-invite";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validators/onboarding.schema";
import { timezoneSchema } from "@/lib/validators/api.schema";
import { completeOnboarding } from "@/lib/services/profile.service";
import { handleRouteError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
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

    // 3b. The browser-detected timezone travels next to the form fields.
    //     A missing or unrecognised zone is dropped, never a 400: failing
    //     someone's signup over a timezone string would be absurd, and the
    //     in-app sync fills it in on their first page load anyway.
    const timezone = timezoneSchema.safeParse(
      (body as { timezone?: unknown } | null)?.timezone
    );

    // 4. Call the service layer (business logic)
    const result = await completeOnboarding(
      {
        id: user.id,
        email: user.email ?? "",
        user_metadata: user.user_metadata as Record<string, string> | undefined,
      },
      validation.data,
      { timezone: timezone.success ? timezone.data : undefined }
    );

    // 5. Return success — plus where to go next: a buddy invite the user
    // opened before they had an account (lib/utils/pending-invite.ts).
    const next = pendingInvitePath(
      request.cookies.get(PENDING_INVITE_COOKIE)?.value
    );
    const response = NextResponse.json(
      {
        success: true,
        profile: result.profile,
        calculated: result.calculated,
        next,
      },
      { status: 201 }
    );
    if (next) response.cookies.delete(PENDING_INVITE_COOKIE);
    return response;
  } catch (error) {
    return handleRouteError(error, "POST /api/onboarding");
  }
}
