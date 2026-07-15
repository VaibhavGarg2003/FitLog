/**
 * GET /api/auth/link/google
 * ═════════════════════════
 *
 * Starts "Connect your Google account" for the CURRENTLY LOGGED-IN user
 * (email/password account gaining a Google sign-in method). Uses
 * `linkIdentity` so the SAME auth user id gets a second identity — no new
 * user, so all app data (profile, workouts, nutrition, progress) is untouched.
 *
 * PREVENTION: we pass `login_hint = the account email` so Google pre-selects
 * the matching account, making the "wrong account" mistake unlikely up front.
 * The /auth/callback?flow=link handler is the CURE — it unlinks if the emails
 * still don't match.
 *
 * Requires "Allow manual linking" enabled in Supabase → Auth → Settings.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?flow=link&redirect=/settings`,
      skipBrowserRedirect: true,
      // Pre-select the account whose email matches — prevention before cure.
      queryParams: user.email ? { login_hint: user.email } : undefined,
    },
  });

  if (error || !data?.url) {
    // Most common cause: manual linking not enabled on the project.
    return NextResponse.redirect(`${origin}/settings?error=link_failed`);
  }

  return NextResponse.redirect(data.url);
}
