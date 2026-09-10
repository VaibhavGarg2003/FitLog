-- ═══════════════════════════════════════════════════════════════════════════
-- 000 — Auto-enable Row Level Security on every new public table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS IS
-- ────────────
-- Supabase exposes every table in `public` through its REST API, reachable by
-- anyone holding the anon key — which ships in the browser bundle and is not a
-- secret. This project closes that API with two locks: `anon`/`authenticated`
-- hold no table grants, and every table has RLS enabled with zero policies
-- (migration 20260712010000_enable_rls_lockdown).
--
-- That migration only covered tables that existed at the time. This event
-- trigger closes the gap for every table created AFTER it: on CREATE TABLE,
-- CREATE TABLE AS, or SELECT INTO in schema `public`, it runs
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Forgetting becomes impossible.
--
-- WHY THIS FILE EXISTS
-- ────────────────────
-- The function and trigger existed in production but NOWHERE in version
-- control — the repo only described them in comments. A rebuild from the repo
-- (new project, staging copy, restore into a fresh database) would silently
-- come out without auto-RLS.
--
-- The body below is EXTRACTED VERBATIM from production (PostgreSQL 17.6) with
-- pg_get_functiondef('public.rls_auto_enable'::regproc). It is deliberately not
-- reconstructed or "tidied": this function runs as `postgres` on every table
-- creation, and it is designed to fail silently, so a subtly wrong rewrite
-- would be a security bug nothing would ever report.
--
-- FINGERPRINT at extraction (use this to detect drift — see
-- EXTRACT_rls_auto_enable.md):
--   md5(prosrc) = 99be20677b456ea8d3be47bdd44fb369   length(prosrc) = 953
-- Verified: installing this file on a fresh PostgreSQL 17 yields the same hash.
--
-- TWO BEHAVIOURS WORTH KNOWING
-- ────────────────────────────
-- 1. It FAILS SILENTLY. On error it only does RAISE LOG — the CREATE TABLE
--    still succeeds and the new table simply has no RLS. Verify after adding a
--    table: SELECT relrowsecurity FROM pg_class WHERE relname = '<table>';
--
-- 2. It relies on a GRANT made by 001_least_privilege_roles.sql. The function
--    runs as `postgres` (SECURITY DEFINER), but enabling RLS requires OWNING the
--    table. Since the role split, new tables are owned by `fitlog_migrate`, so
--    001 runs `GRANT fitlog_migrate TO postgres` specifically to keep this
--    working. Remove that grant and auto-RLS breaks — silently, per point 1.
--    The dependency runs one way: THIS file's protection needs 001's grant.
--    001 itself contains no SQL that uses this function and runs fine without it.
--
-- GRANTS
-- ──────
-- Production's ACL on the function is
--   {=X/postgres, postgres=X/postgres, anon=X/postgres,
--    authenticated=X/postgres, service_role=X/postgres}
-- — i.e. Supabase's default privileges for new functions in `public`. They are
-- NOT reproduced here: a fresh Supabase project applies them automatically, and
-- on plain Postgres the roles anon/authenticated/service_role do not exist, so
-- explicit GRANTs would make this script fail. They are harmless either way:
-- a function RETURNS event_trigger cannot be called directly — Postgres rejects
-- it outside an actual event-trigger firing.
--
-- HOW TO RUN — as `postgres` (event triggers require superuser-level rights):
--
--   psql "$SUPERUSER_DIRECT_URL" -f db/roles/000_rls_auto_enable.sql
--
-- SAFE TO RE-RUN, AND IT REPAIRS. CREATE OR REPLACE for the function. The
-- trigger is checked for its event, function and tag set — not merely its name —
-- and dropped and recreated if any of those differ, then re-owned and
-- re-enabled. Against production (which already has both, correctly wired) it
-- changes nothing.
--
-- Numbered 000: run it before 001, and before applying Prisma migrations to a
-- fresh database, so every table created afterwards is covered. See point 2 for
-- why 001 does not strictly need it.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. The function — verbatim from production ──────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

-- ── 2. The event trigger ────────────────────────────────────────────────────
-- Verify the WIRING, not just the name. A trigger called ensure_rls that fires on
-- the wrong event, calls a different function, or filters a narrower tag set
-- would otherwise be accepted and switched back on — and this script would report
-- success while auto-RLS stayed partly or wholly broken. Anything that does not
-- match production exactly is dropped and recreated. (CREATE EVENT TRIGGER has no
-- IF NOT EXISTS, which is why this is a DO block at all.)
DO $$
DECLARE
  t            record;
  needs_create boolean;
BEGIN
  SELECT evtevent, evtfoid, evttags
    INTO t
    FROM pg_event_trigger
   WHERE evtname = 'ensure_rls';

  IF NOT FOUND THEN
    needs_create := true;

  ELSIF t.evtevent = 'ddl_command_end'
    AND t.evtfoid  = 'public.rls_auto_enable()'::regprocedure
    AND t.evttags IS NOT NULL
    -- Order-insensitive tag comparison, pinned to the C collation so the result
    -- cannot depend on the database's locale.
    AND (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(t.evttags) AS x)
      = (SELECT array_agg(x ORDER BY x COLLATE "C")
           FROM unnest(ARRAY['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']::text[]) AS x)
  THEN
    needs_create := false;

  ELSE
    RAISE NOTICE 'ensure_rls exists but is mis-wired (event=%, function=%, tags=%) - recreating it',
      t.evtevent, t.evtfoid::regprocedure, t.evttags;
    DROP EVENT TRIGGER ensure_rls;
    needs_create := true;
  END IF;

  IF needs_create THEN
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END
$$;

-- Match production: owned by postgres, enabled ('O').
-- Re-enabling is intentional. Together with the wiring check above, re-running
-- this file restores a trigger that was missing, disabled, OR mis-wired.
ALTER EVENT TRIGGER ensure_rls OWNER TO postgres;
ALTER EVENT TRIGGER ensure_rls ENABLE;

COMMIT;
