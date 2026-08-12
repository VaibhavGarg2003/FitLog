/**
 * Auth Repository — queries against Supabase's `auth` schema
 * ═══════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * Whether an account has a password CANNOT be derived from the identities
 * list. Supabase's `updateUser({ password })` sets `auth.users.encrypted_password`
 * WITHOUT creating an "email" identity (verified empirically: a Google-first
 * user who added a password has has_password=true but identities=['google']).
 * So we ask the database directly — but NOT by reading `auth.users` here.
 *
 * WHY NOT READ auth.users DIRECTLY (this used to):
 * ────────────────────────────────────────────────
 * This file previously ran `SELECT ... FROM auth.users` and relied on Prisma
 * connecting as `postgres`. Since db/roles/001 the runtime connects as
 * `fitlog_app`, which has no access to the `auth` schema at all — and cannot be
 * given any, because `postgres` holds USAGE on `auth` WITHOUT grant option, so
 * it is unable to pass that access on. Only `supabase_admin` could, and that
 * role is reserved by the platform.
 *
 * So the read happens inside `private.user_has_password()`, a SECURITY DEFINER
 * function owned by `postgres` (which CAN read auth). We only execute it.
 *
 * It lives in the `private` schema, not `public`, on purpose: PostgREST exposes
 * `public`, and Supabase's default privileges auto-grant EXECUTE on new public
 * functions to anon/authenticated. In `public` this would have been a
 * user-enumeration oracle at /rest/v1/rpc/user_has_password — anyone with the
 * anon key could probe whether a given user id has a password.
 *
 * We only read a boolean — never the hash itself.
 */

import { prisma } from "@/lib/supabase/prisma";

export async function userHasPassword(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ has_password: boolean }[]>`
    SELECT private.user_has_password(${userId}::uuid) AS has_password
  `;
  return rows[0]?.has_password ?? false;
}
