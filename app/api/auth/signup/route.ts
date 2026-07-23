/**
 * POST /api/auth/signup
 * ═════════════════════
 *
 * Server-side email signup. Same security goal as /api/auth/login:
 * tokens never return in the browser JSON body.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(200),
  // Cloudflare Turnstile token (production). Supabase verifies with the
  // Secret Key configured in Dashboard → Auth → CAPTCHA.
  captchaToken: z.string().min(1).max(2048).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check your email and password (min 6 characters)." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();

  // Name is intentionally not collected here — it is captured during
  // onboarding (Step 1) and written to public.users via completeOnboarding.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Confirmation email lands on our dedicated page (not the marketing home).
      // Must be allowlisted in Supabase → Auth → URL Configuration → Redirect URLs.
      emailRedirectTo: `${origin}/confirmed`,
      ...(parsed.data.captchaToken
        ? { captchaToken: parsed.data.captchaToken }
        : {}),
    },
  });

  if (error) {
    const message = /captcha|turnstile/i.test(error.message)
      ? "Human verification failed. Please try again."
      : "Could not create account. Try a different email or try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // DUPLICATE-EMAIL TRAP: with Supabase's email-enumeration protection ON
  // (the default), signUp() for an already-registered email returns NO error
  // and a decoy user whose `identities` array is EMPTY — and no real email is
  // sent. Without this check the UI would show "Check your email" forever.
  // An empty identities array is the documented signal for "already exists".
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return NextResponse.json(
      {
        code: "ACCOUNT_EXISTS",
        error:
          "An account with this email already exists. Log in instead — if you signed up with Google, use Continue with Google.",
      },
      { status: 409 }
    );
  }

  // If email confirmation is required, session is null and cookies stay empty.
  // If auto-confirm is on, session cookies are set httpOnly on this response.
  return NextResponse.json({
    ok: true,
    needsConfirmation: !data.session,
  });
}
