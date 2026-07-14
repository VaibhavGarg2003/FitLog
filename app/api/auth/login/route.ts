/**
 * POST /api/auth/login
 * ════════════════════
 *
 * Server-side email/password sign-in.
 *
 * WHY NOT signInWithPassword IN THE BROWSER?
 * ──────────────────────────────────────────
 * Client-side auth calls Supabase Auth from the browser. The response body
 * contains access_token + refresh_token in clear JSON — visible in DevTools
 * Network and grab-able by XSS. Here the browser only talks to our origin;
 * the token exchange happens server-side and session is written as httpOnly
 * cookies. Response body is only { ok: true } — never tokens.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Safe, user-facing messages only — never echo raw provider payloads.
    const message =
      error.message === "Email not confirmed"
        ? "Please confirm your email before signing in."
        : "Invalid email or password";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  // Session is in httpOnly Set-Cookie via createClient — no tokens in body.
  return NextResponse.json({ ok: true });
}
