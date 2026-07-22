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
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

export async function createClient() {
  // cookies() is async in Next.js 15+ (it was sync before).
  // We must await it to get the cookie store.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // httpOnly session cookies — never readable by browser JS / XSS
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        // GET a cookie by name — Supabase reads the session token
        getAll() {
          return cookieStore.getAll();
        },

        // SET cookies — Supabase writes refreshed session tokens
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                ...AUTH_COOKIE_OPTIONS,
              })
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
 * Uses getUser(), which makes a NETWORK round-trip to the Supabase Auth
 * server to validate the token. Only use this where you truly need the
 * freshest, server-verified user object (e.g. right after login). For the
 * hot path (every API route / page load) prefer getAuthUserId() below.
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Helper: Get the current user's id from the JWT, or null if not logged in.
 *
 * USE THIS in every API route / server component as the FIRST step:
 *   const userId = await getAuthUserId();
 *   if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *
 * WHY getClaims() INSTEAD OF getUser()?
 * ─────────────────────────────────────
 * getClaims() verifies the JWT signature LOCALLY using the WebCrypto API
 * (asymmetric signing keys) — no network round-trip. It fetches the public
 * JWKS once and caches it. getUser() instead calls the Auth server on every
 * request, adding ~200-400ms per call. Since the token is signed, we can
 * trust its claims (including `sub` = user id) after a local signature check.
 *
 * NOTE: Requires asymmetric JWT signing keys enabled on the Supabase project
 * (Dashboard → Auth → Signing Keys). If the project still uses the legacy
 * symmetric secret, getClaims() transparently falls back to a getUser()
 * network call — correct, just not faster until you migrate the keys.
 */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return data.claims.sub ?? null;
}

/**
 * Helper: Get the current session's raw access token (the Supabase JWT),
 * or null if not logged in.
 *
 * Used to authenticate calls FROM our Next.js server TO the Django service
 * — the browser talks to same-origin Next.js API routes, which forward
 * this token as `Authorization: Bearer <token>`. Django verifies its
 * signature locally (the same JWT, one identity provider, two verifiers).
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
