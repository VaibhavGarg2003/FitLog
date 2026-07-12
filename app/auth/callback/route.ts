/**
 * OAuth Callback Route Handler
 * ════════════════════════════
 *
 * WHAT IS THIS?
 * ─────────────
 * When a user logs in with Google OAuth, the flow is:
 * 1. User clicks "Sign in with Google"
 * 2. Browser redirects to Google's login page
 * 3. User authenticates with Google
 * 4. Google redirects back to YOUR app with a `code` parameter
 * 5. THIS route handler receives that `code`
 * 6. It exchanges the `code` for an auth session (JWT token)
 * 7. It redirects the user to /dashboard (or their intended page)
 *
 * WHY A ROUTE HANDLER (not a page)?
 * ──────────────────────────────────
 * This is server-side code (route.ts, not page.tsx).
 * The OAuth code exchange MUST happen on the server because:
 * - It involves your app's secret key (never exposed to browser)
 * - The `code` is single-use and must be exchanged quickly
 *
 * The URL structure is: /auth/callback?code=xxx&redirect=/dashboard
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // origin = "https://fitlog.vercel.app" (your domain)

  const code = searchParams.get("code");
  // Sanitized — an attacker-supplied ?redirect must stay on our origin
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();

    // Exchange the OAuth code for a session.
    // This is the critical step — it validates the code with Google
    // and creates a Supabase session (JWT) for the user.
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Success → redirect to the app
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Something went wrong → redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
