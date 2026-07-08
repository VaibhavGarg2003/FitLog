/**
 * Supabase Server Client — Session Validation
 * ════════════════════════════════════════════
 *
 * WHAT THIS FILE DOES:
 * Creates a Supabase client for SERVER-SIDE code (API routes,
 * Server Actions, middleware). Used to read the user's session
 * from cookies and verify they're authenticated.
 *
 * WHY IS THIS DIFFERENT FROM client.ts?
 * ─────────────────────────────────────
 * In the browser, cookies are accessed via `document.cookie`.
 * On the server, cookies come from the request's `Cookie` header.
 * The server client needs to READ cookies from the request and
 * WRITE cookies to the response (to refresh expired tokens).
 *
 * Next.js provides cookies() from 'next/headers' for this.
 *
 * IMPORTANT: createServerClient requires a CookieOptions object
 * that tells it how to get/set/remove cookies. In Next.js,
 * we use the `cookies()` function from 'next/headers'.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // cookies() is async in Next.js 15+ (it was sync before).
  // We must await it to get the cookie store.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // GET a cookie by name — Supabase reads the session token
        getAll() {
          return cookieStore.getAll();
        },

        // SET cookies — Supabase writes refreshed session tokens
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Silently fail if called from a Server Component
            // (Server Components can't set cookies — only Route Handlers
            // and Server Actions can). This is expected behavior.
          }
        },
      },
    }
  );
}

/**
 * Helper: Get the current authenticated user, or null if not logged in.
 *
 * USE THIS in every API route as the FIRST step:
 *   const user = await getAuthUser();
 *   if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // getUser() validates the JWT token with Supabase's servers.
  // It's more secure than getSession() which only decodes the
  // token locally without verifying it hasn't been tampered with.
  return user;
}
