/**
 * Account Repository — privileged account deletion only
 * ══════════════════════════════════════════════════════
 *
 * SECURITY CONSTRAINT THAT SHAPES THIS FILE:
 * ──────────────────────────────────────────
 * fitlog_app deliberately has no DELETE on public.users because
 * share_links.owner_user_id is ON DELETE CASCADE (see db/roles/README.md).
 * Account deletion therefore cannot run on the runtime Prisma client.
 *
 * Instead we call private.delete_user_account(uuid) via a separate role
 * (fitlog_deleter) whose ONLY privilege is EXECUTE on that function. The
 * connection string is ACCOUNT_DELETION_DATABASE_URL — no fallback to
 * DATABASE_URL or DIRECT_URL. If the var is absent the client is never
 * constructed and callers get ServiceUnavailableError.
 *
 * The function itself lives in schema `private` (not public) so Supabase
 * default privileges cannot expose it over PostgREST to anon/authenticated.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { ServiceUnavailableError } from "@/lib/utils/errors";

const globalForDeleter = globalThis as unknown as {
  accountDeletionPrisma: PrismaClient | undefined;
};

/**
 * True when ACCOUNT_DELETION_DATABASE_URL is set. Does not open a connection.
 * Used by GET /api/account so the UI can hide the control when unprovisioned.
 */
export function isAccountDeletionProvisioned(): boolean {
  return Boolean(process.env.ACCOUNT_DELETION_DATABASE_URL);
}

/**
 * Lazily construct a dedicated PrismaClient (pool max: 1) for the deleter
 * role. No fallback to DATABASE_URL / DIRECT_URL — missing env means the
 * feature is intentionally inert.
 */
function getDeletionClient(): PrismaClient {
  const url = process.env.ACCOUNT_DELETION_DATABASE_URL;
  if (!url) {
    throw new ServiceUnavailableError(
      "Account deletion is not available on this environment."
    );
  }

  if (!globalForDeleter.accountDeletionPrisma) {
    const pool = new Pool({
      connectionString: url,
      max: 1,
    });
    const adapter = new PrismaPg(pool);
    globalForDeleter.accountDeletionPrisma = new PrismaClient({
      adapter,
      log: ["error"],
    });
  }

  return globalForDeleter.accountDeletionPrisma;
}

/** Postgres SQLSTATE codes that mean "deletion function not provisioned". */
const PROVISIONING_SQLSTATES = new Set([
  "42883", // undefined_function
  "3F000", // invalid_schema_name
  "42501", // insufficient_privilege
]);

function mapDeletionError(error: unknown): never {
  // Unset env is handled before client construction; still map raw failures
  // from a half-provisioned database (role exists but function/schema/grant
  // missing) to 503 so the UI can treat them as "not available".
  if (error instanceof ServiceUnavailableError) throw error;

  const sqlstate = extractSqlstate(error);
  if (sqlstate && PROVISIONING_SQLSTATES.has(sqlstate)) {
    throw new ServiceUnavailableError(
      "Account deletion is not available on this environment."
    );
  }

  // Prisma raw-query failures often wrap the driver error as P2010.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2010"
  ) {
    const metaCode = String(
      (error.meta as { code?: string } | undefined)?.code ?? ""
    );
    if (PROVISIONING_SQLSTATES.has(metaCode)) {
      throw new ServiceUnavailableError(
        "Account deletion is not available on this environment."
      );
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  for (const code of PROVISIONING_SQLSTATES) {
    if (message.includes(code)) {
      throw new ServiceUnavailableError(
        "Account deletion is not available on this environment."
      );
    }
  }

  throw error;
}

function extractSqlstate(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    code?: string;
    meta?: { code?: string };
    cause?: { code?: string };
  };
  // Postgres SQLSTATE is five chars from [0-9A-Z] (e.g. 42883, 3F000, 42501).
  // Digits-only would miss letter-bearing codes like 3F000 (invalid_schema_name).
  if (typeof e.meta?.code === "string" && /^[0-9A-Z]{5}$/.test(e.meta.code)) {
    return e.meta.code;
  }
  if (typeof e.cause?.code === "string" && /^[0-9A-Z]{5}$/.test(e.cause.code)) {
    return e.cause.code;
  }
  // node-pg style
  if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
    return e.code;
  }
  return null;
}

/**
 * Permanently delete the user's app row (cascading) and auth.users row via
 * private.delete_user_account. Returns whether a public.users row was removed.
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  let client: PrismaClient;
  try {
    client = getDeletionClient();
  } catch (error) {
    mapDeletionError(error);
  }

  try {
    const rows = await client.$queryRaw<{ deleted: boolean }[]>`
      SELECT private.delete_user_account(${userId}::uuid) AS deleted
    `;
    return rows[0]?.deleted ?? false;
  } catch (error) {
    mapDeletionError(error);
  }
}
