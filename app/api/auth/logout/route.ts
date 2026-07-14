/**
 * POST /api/auth/logout
 * ═════════════════════
 *
 * Clears the Supabase session cookies on the server (httpOnly).
 * Browser never needs the access token to sign out.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
