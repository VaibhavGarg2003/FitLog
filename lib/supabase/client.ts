/**
 * Supabase Browser Client — DO NOT USE FOR LOGIN / SESSION
 * ════════════════════════════════════════════════════════
 *
 * Auth (login, signup, logout, OAuth start) MUST go through our Next.js
 * API routes under /api/auth/* so the access/refresh tokens:
 *   1. Are exchanged only server ↔ Supabase (never browser ↔ Supabase Auth)
 *   2. Are stored in httpOnly cookies (not document.cookie / localStorage)
 *   3. Never appear in a JSON response body the browser can read
 *
 * This helper remains only for rare client-side Supabase features that do
 * not need the session (none currently). Prefer server createClient instead.
 *
 * If you import this for signIn / signUp / signOut, you are regressing
 * token exposure — use /api/auth/* instead.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
