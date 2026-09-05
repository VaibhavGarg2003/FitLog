-- ═══════════════════════════════════════════════════════════════════════════
-- 002 — Account deletion (SECURITY DEFINER, fitlog_deleter only)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS SOLVES
-- ────────────────
-- Account deletion needs to remove public.users (cascading app tables AND
-- Django share_links via ON DELETE CASCADE) and auth.users. fitlog_app
-- deliberately has NO DELETE on public.users (see 001 / README) because that
-- privilege is the exact blast radius the role split exists to remove.
--
-- Granting fitlog_app EXECUTE on a SECURITY DEFINER deletion function would
-- hand that blast radius straight back and widen it. So:
--
--   • Function lives in schema `private` (not public: Supabase default
--     privileges auto-grant EXECUTE on new public functions to
--     anon/authenticated — PostgREST would expose account deletion).
--   • Owned by postgres, SECURITY DEFINER, search_path pinned.
--   • New role fitlog_deleter has NO table privileges at all — only EXECUTE
--     on this function.
--   • Runtime uses ACCOUNT_DELETION_DATABASE_URL (that role). Never grant
--     EXECUTE to fitlog_app.
--
-- HOW TO RUN — as `postgres`, via DIRECT connection (port 5432):
--
--   ⚠ PREREQUISITE: db/roles/001_least_privilege_roles.sql must be applied
--   first (creates schema `private`). This script does not create that schema
--   and will fail early with a clear error if it is missing.
--
--   psql "$SUPERUSER_DIRECT_URL" \
--     -v deleter_password="$(openssl rand -hex 32)" \
--     -f db/roles/002_delete_user_account.sql
--
-- Then set ACCOUNT_DELETION_DATABASE_URL to a connection string for
-- fitlog_deleter (pooler is fine — this is DML via a function, not DDL).
--
-- This feature is INERT until the role exists and the env var is set.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

-- Fail early if 001 was never applied — before CREATE ROLE, so a missing
-- `private` schema does not leave a half-applied fitlog_deleter role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private') THEN
    RAISE EXCEPTION
      'Schema "private" not found. Apply db/roles/001_least_privilege_roles.sql first.';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Role: fitlog_deleter — no table privileges, function EXECUTE only.
--    Password via psql -v deleter_password=... (same pattern as 001).
-- ───────────────────────────────────────────────────────────────────────────
CREATE ROLE fitlog_deleter
  LOGIN PASSWORD :'deleter_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT NOBYPASSRLS;

COMMENT ON ROLE fitlog_deleter IS
  'Account-deletion only. No table privileges. EXECUTE on '
  'private.delete_user_account only. ACCOUNT_DELETION_DATABASE_URL. '
  'Created by db/roles/002. Never grant this function to fitlog_app.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. private.delete_user_account — cascade-delete app user + auth user.
--
--    public.users.id is TEXT (Prisma); auth.users.id is uuid. Accept uuid and
--    cast for the public delete. Returns true if a public.users row was
--    removed (auth row deleted when present).
--
--    Follows the private.user_has_password pattern: SECURITY DEFINER, owned
--    by postgres, search_path pinned, REVOKE FROM PUBLIC.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.delete_user_account(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  deleted_app boolean := false;
BEGIN
  DELETE FROM public.users WHERE id = p_user_id::text;
  deleted_app := FOUND;

  -- Auth user may already be gone (partial prior attempt); ignore miss.
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN deleted_app;
END;
$$;

REVOKE ALL ON FUNCTION private.delete_user_account(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO fitlog_deleter;
GRANT EXECUTE ON FUNCTION private.delete_user_account(uuid) TO fitlog_deleter;

-- Explicit: fitlog_app must NEVER receive EXECUTE on this function.
-- (No GRANT to fitlog_app. Do not add one.)

COMMIT;
