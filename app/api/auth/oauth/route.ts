/**
 * GET /api/auth/oauth?provider=google&redirect=/dashboard
 * ═══════════════════════════════════════════════════════
 *
 * Starts OAuth on the server. The browser only receives a redirect to Google
 * (or an error page) — it never calls Supabase Auth with credentials or
 * receives an access_token JSON body. After Google, /auth/callback exchanges
 * the code server-side and sets httpOnly session cookies.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

const ALLOWED_PROVIDERS = new Set(["google"]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const provider = (searchParams.get("provider") ?? "").toLowerCase();
  const redirect = safeRedirectPath(searchParams.get("redirect"));

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google",
    options: {
      redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      // Return the URL instead of relying on browser client navigation.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return NextResponse.redirect(data.url);
}
