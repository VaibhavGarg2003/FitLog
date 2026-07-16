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
import { userHasPassword } from "@/lib/repositories/auth.repository";

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

  // NOTE: hasPassword must come from auth.users.encrypted_password, NOT from
  // the identities list — updateUser({ password }) sets a password without
  // creating an "email" identity, so `providers.includes("email")` misses
  // passwords added by Google-first users.
  const hasPassword = await userHasPassword(user.id);

  return NextResponse.json({
    email: user.email ?? null,
    providers,
    hasPassword,
    hasGoogle: providers.includes("google"),
  });
}
