/**
 * Auth Repository — queries against Supabase's `auth` schema
 * ═══════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * Whether an account has a password CANNOT be derived from the identities
 * list. Supabase's `updateUser({ password })` sets `auth.users.encrypted_password`
 * WITHOUT creating an "email" identity (verified empirically: a Google-first
 * user who added a password has has_password=true but identities=['google']).
 * So we ask the database directly. Prisma connects as `postgres`, which can
 * read the `auth` schema via raw SQL even though it's not in our Prisma models.
 *
 * We only read a boolean — never the hash itself.
 */

import { prisma } from "@/lib/supabase/prisma";

export async function userHasPassword(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ has_password: boolean }[]>`
    SELECT (encrypted_password IS NOT NULL AND encrypted_password <> '') AS has_password
    FROM auth.users
    WHERE id = ${userId}::uuid
  `;
  return rows[0]?.has_password ?? false;
}
