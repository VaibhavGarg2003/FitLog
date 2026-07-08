/**
 * Supabase Middleware Helper — Session Refresh
 * ═════════════════════════════════════════════
 *
 * WHAT IS MIDDLEWARE IN NEXT.JS?
 * ─────────────────────────────
 * Middleware is code that runs BEFORE a page or API route renders.
 * Every request to your app passes through middleware first.
 * Think of it as a security checkpoint at the entrance of a building.
 *
 * WHAT THIS HELPER DOES:
 * ─────────────────────
 * 1. Reads the Supabase session from the request cookies
 * 2. If the JWT token is about to expire, refreshes it
 * 3. Writes the refreshed token back to the response cookies
 *
 * WHY DO WE NEED TO REFRESH TOKENS?
 * ─────────────────────────────────
 * Supabase auth uses JWTs (JSON Web Tokens) that expire after 1 hour.
 * If the user is active (browsing the app), we refresh the token
 * silently so they're never logged out unexpectedly.
 *
 * Without this middleware, the user would be logged out every hour
 * and redirected to the login page. Terrible UX.
 *
 * HOW NEXT.JS REQUEST/RESPONSE WORKS:
 * ────────────────────────────────────
 * In Next.js middleware, you can't modify the original request.
 * Instead, you create a NextResponse, copy the request's cookies
 * to the response, let Supabase modify them, then return the response.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // Start with a "pass-through" response — don't block, just forward
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create a Supabase client that can read/write cookies on this request
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Step 1: Set cookies on the request (for downstream server code)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          // Step 2: Create a new response with updated request
          supabaseResponse = NextResponse.next({ request });

          // Step 3: Set cookies on the response (sent back to browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // CRITICAL: getUser() validates the token with Supabase.
  // This call also triggers token refresh if needed.
  // Do NOT use getSession() here — it doesn't validate the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
