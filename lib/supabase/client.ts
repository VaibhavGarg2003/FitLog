/**
 * Supabase Browser Client — AUTH ONLY
 * ════════════════════════════════════
 *
 * WHAT THIS FILE DOES:
 * Creates a Supabase client for the BROWSER. This client is used
 * ONLY for authentication (login, logout, get session).
 *
 * ❌ NEVER use this for database queries (supabase.from('...').select())
 * ✅ All data access goes through API routes → services → repositories → Prisma
 *
 * WHY @supabase/ssr?
 * ──────────────────
 * The `@supabase/ssr` package is designed for server-side rendering
 * frameworks like Next.js. It handles cookies correctly across
 * server and client, which the plain `@supabase/supabase-js` doesn't.
 *
 * WHAT IS createBrowserClient?
 * ───────────────────────────
 * It creates a Supabase client that stores the auth session in
 * browser cookies (not localStorage). Cookies are automatically
 * sent with every request to the server, so the server can verify
 * the user's session without the client explicitly passing a token.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // The `!` (non-null assertion) tells TypeScript:
    // "I guarantee these environment variables exist at runtime."
    // If they don't, the app crashes — which is correct behavior
    // because the app CAN'T work without Supabase credentials.
  );
}

// USAGE IN COMPONENTS:
// const supabase = createClient();
// await supabase.auth.signInWithOAuth({ provider: 'google' });
// await supabase.auth.signOut();
// const { data: { session } } = await supabase.auth.getSession();
