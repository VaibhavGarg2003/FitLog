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
  name: z.string().trim().min(1).max(100),
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
      { error: "Please check your name, email, and password (min 6 characters)." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      // Confirmation email lands on our dedicated page (not the marketing home).
      // Must be allowlisted in Supabase → Auth → URL Configuration → Redirect URLs.
      emailRedirectTo: `${origin}/confirmed`,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: "Could not create account. Try a different email or try again." },
      { status: 400 }
    );
  }

  // If email confirmation is required, session is null and cookies stay empty.
  // If auto-confirm is on, session cookies are set httpOnly on this response.
  return NextResponse.json({
    ok: true,
    needsConfirmation: !data.session,
  });
}
