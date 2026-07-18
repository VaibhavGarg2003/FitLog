/**
 * OAuth Callback Route Handler
 * ════════════════════════════
 *
 * WHAT IS THIS?
 * ─────────────
 * When a user logs in with Google OAuth, the flow is:
 * 1. User clicks "Sign in with Google" (login OR signup — same OAuth)
 * 2. Browser redirects to Google's login page
 * 3. User authenticates with Google
 * 4. Google redirects back to YOUR app with a `code` parameter
 * 5. THIS route handler receives that `code`
 * 6. It exchanges the `code` for an auth session (JWT token)
 * 7. It redirects the user into the app (or onboarding if first time)
 *
 * AUTO-SIGNUP (important):
 * ───────────────────────
 * Supabase `signInWithOAuth` creates an auth.users row automatically when
 * the Google account is new. There is no separate "must visit /signup first"
 * step for Google. Login and signup both call the same OAuth starter;
 * first-time users get a session, then we send them to /onboarding.
 * App data (public.users + Profile) is created only when onboarding finishes.
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
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // origin = "https://fitlog.vercel.app" (your domain)

  const code = searchParams.get("code");
  // "link" = this callback is completing a "Connect Google" from Settings,
  // not a login. It gets stricter handling (email must match) below.
  const isLink = searchParams.get("flow") === "link";
  // Sanitized — an attacker-supplied ?redirect must stay on our origin
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();

    // Exchange the OAuth code for a session.
    // This is the critical step — it validates the code with Google
    // and creates a Supabase session (JWT) for the user.
    // If this Google account has never used the app, Supabase also
    // creates auth.users here (auto-signup).
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (isLink) {
        // CONNECT-GOOGLE: enforce the email-match rule ourselves. Supabase
        // links by user id, so it would happily attach a DIFFERENT Google
        // account. We compare the just-linked Google identity's email to the
        // account email and UNLINK on mismatch — leaving the account exactly
        // as it was (their existing session/data untouched).
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const accountEmail = user?.email?.trim().toLowerCase();
        const googleIdentity = user?.identities?.find(
          (i) => i.provider === "google"
        );
        const googleEmail = (
          googleIdentity?.identity_data?.email as string | undefined
        )
          ?.trim()
          .toLowerCase();

        if (googleIdentity && googleEmail && googleEmail !== accountEmail) {
          // Wrong Google account — undo the link, change nothing else.
          await supabase.auth.unlinkIdentity(googleIdentity).catch(() => {});
          return NextResponse.redirect(
            `${origin}/settings?error=google_email_mismatch`
          );
        }

        return NextResponse.redirect(`${origin}/settings?linked=google`);
      }

      // Normal login/signup (including first-time Google from /login).
      // New users have no completed profile yet → onboarding, not dashboard.
      // (App layout would also bounce them, but routing here avoids a flash.)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const onboarded = await isUserOnboarded(user.id);
        if (!onboarded) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Something went wrong.
  if (isLink) {
    return NextResponse.redirect(`${origin}/settings?error=link_failed`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
