-- ═══════════════════════════════════════════════════════════════════════════
-- 004 — Take every privilege in schema public away from anon / authenticated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS SOLVES
-- ────────────────
-- Supabase's two API roles — `anon` (anyone holding the publishable key, which
-- ships in the browser) and `authenticated` (anyone holding a user JWT) — were
-- found on 2026-10-09 to hold SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES and TRIGGER on 27 of the 29 public tables in production, and
-- USAGE on every sequence. They came from Supabase's default privileges for
-- objects created by `postgres` (every table before the role split, plus
-- Django's tables). Tables created later by fitlog_migrate never got them.
--
-- Deny-all RLS (zero policies) is what has kept rows unreadable. But RLS does
-- not govern TRUNCATE, REFERENCES or TRIGGER, and it is one switch away from
-- being turned off on a table. This app never uses the Supabase Data API
-- (PostgREST) — Next.js talks to Postgres as fitlog_app, Django as its own
-- role — so these grants are pure exposure. Removing them makes the API roles
-- hold nothing in public: the second lock 000's header always assumed.
--
-- It matters more from now on: the chat feature's failover phase will put a
-- user JWT (`authenticated`) into browser JavaScript.
--
-- WHAT THIS DOES
-- ──────────────
--   1. REVOKE ALL on every existing table, sequence and function in public
--      from anon and authenticated.
--   2. ALTER DEFAULT PRIVILEGES FOR ROLE postgres so tables/sequences/functions
--      that postgres creates later (Django migrations, break-glass work) are
--      born without those grants. fitlog_migrate's defaults already grant
--      only to fitlog_app (001 step 6) and are left alone.
--   3. Verifies, inside the transaction, that neither role can do anything to
--      any public relation or sequence; aborts (rolling everything back) if
--      it can.
--
-- WHAT IT DOES NOT TOUCH
-- ──────────────────────
--   • service_role — used only server-side with the secret key; out of scope.
--   • Other schemas (storage, graphql, realtime, auth) — Supabase-managed.
--   • Defaults FOR ROLE supabase_admin — postgres cannot alter another role's
--     defaults; supabase_admin does not create objects in public.
--   • EXECUTE that functions inherit from PUBLIC — that is the Postgres
--     default for every role, not an anon/authenticated grant.
--
-- HOW TO RUN — as `postgres`:
--
--   psql "$SUPERUSER_DIRECT_URL" -f db/roles/004_revoke_api_role_grants.sql
--
--   (Supabase SQL editor: paste everything below the `\set` line.)
--
-- Idempotent: safe to re-run. Undo with 004_revoke_api_role_grants_rollback.sql.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      '004 must run as postgres (it alters postgres''s default privileges); current_user = %',
      current_user;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Existing objects
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Future objects created by postgres
-- ───────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verify before committing
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  leaked_relations int;
  leaked_sequences int;
  leaked_functions int;
  leaked_defaults  int;
BEGIN
  SELECT count(*) INTO leaked_relations
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_table_privilege(
          r.rolname, c.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');

  SELECT count(*) INTO leaked_sequences
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
    AND has_sequence_privilege(r.rolname, c.oid, 'USAGE, SELECT, UPDATE');

  -- Explicit grants only (PUBLIC's default EXECUTE is deliberately ignored).
  SELECT count(*) INTO leaked_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) AS a
  WHERE n.nspname = 'public'
    AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole);

  SELECT count(*) INTO leaked_defaults
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
  WHERE n.nspname = 'public'
    AND d.defaclrole = 'postgres'::regrole
    AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole);

  IF leaked_relations + leaked_sequences + leaked_functions + leaked_defaults > 0 THEN
    RAISE EXCEPTION
      '004 verification failed: relations=%, sequences=%, functions=%, default ACL entries=% still reachable by anon/authenticated',
      leaked_relations, leaked_sequences, leaked_functions, leaked_defaults;
  END IF;

  RAISE NOTICE '004 verified: anon/authenticated hold no privileges in schema public.';
END $$;

COMMIT;
