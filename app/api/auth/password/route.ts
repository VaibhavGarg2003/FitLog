/**
 * POST /api/auth/password
 * ═══════════════════════
 *
 * Sets (or changes) the password on the CURRENTLY LOGGED-IN account. The main
 * use is a Google-only user adding a password so email/password login works
 * next time — the clean, no-duplicate answer to "signed up with Google, now
 * want email login". `updateUser({ password })` adds an email identity to the
 * SAME auth user, so all existing data stays put.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ password: z.string().min(6).max(200) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not set password. Please try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
