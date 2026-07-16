/**
 * POST /api/auth/password
 * ═══════════════════════
 *
 * Sets or changes the password on the CURRENTLY LOGGED-IN account.
 *
 * TWO MODES (decided server-side, never trusted from the client):
 *
 *   • ADD (account has NO password yet — e.g. Google-first user):
 *     just { password }. Being logged in via Google already proves control
 *     of the mailbox, so no further proof is needed for a FIRST password.
 *
 *   • CHANGE (account already has a password):
 *     requires { currentPassword, password }. We verify currentPassword
 *     before updating — so a stranger at an unlocked laptop (or a stolen
 *     session) cannot silently take over the account by swapping the
 *     password. This is the standard production re-authentication rule.
 *
 * The verification uses a BARE supabase-js client with no cookie adapter and
 * no session persistence: a wrong guess changes nothing, a right guess only
 * confirms — the real session cookies are never touched. Failed attempts
 * count toward Supabase's auth rate limits (brute-force protection for free).
 *
 * `updateUser({ password })` writes auth.users.encrypted_password on the SAME
 * auth user — no new identity, no new user, app data untouched.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { userHasPassword } from "@/lib/repositories/auth.repository";

const schema = z.object({
  password: z.string().min(6).max(200),
  currentPassword: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  // Server decides whether this is add or change — the client can't skip
  // re-authentication by simply omitting currentPassword.
  const hasPassword = await userHasPassword(user.id);

  if (hasPassword) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { code: "CURRENT_REQUIRED", error: "Enter your current password." },
        { status: 400 }
      );
    }

    // Verify the current password WITHOUT touching the real session:
    // bare client, in-memory only, discarded after the check.
    const bare = createBareClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error: verifyError } = await bare.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 403 }
      );
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    // e.g. "New password should be different from the old password."
    const message = error.message?.includes("different")
      ? "New password must be different from the current one."
      : "Could not set password. Please try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
