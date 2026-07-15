/**
 * GET /api/auth/identities
 * ════════════════════════
 *
 * Returns the sign-in methods linked to the current account so the Settings
 * "Sign-in methods" card can show what's connected and offer Connect / Add.
 *
 * Source of truth is Supabase Auth (auth.identities), never Prisma — providers
 * live on the auth user, not in our app tables.
 *
 *   → { email, providers: ["email","google"], hasPassword, hasGoogle }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identities = user.identities ?? [];
  const providers = identities.map((i) => i.provider);

  return NextResponse.json({
    email: user.email ?? null,
    providers,
    hasPassword: providers.includes("email"),
    hasGoogle: providers.includes("google"),
  });
}
