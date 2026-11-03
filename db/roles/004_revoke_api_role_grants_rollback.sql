-- ═══════════════════════════════════════════════════════════════════════════
-- 004 ROLLBACK — give anon / authenticated back the Supabase-default grants
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Restores what existed before 004: full privileges for anon/authenticated on
-- every table, sequence and function OWNED BY postgres in public (that is
-- where the old grants came from), and postgres's default privileges.
-- Objects owned by fitlog_migrate never had these grants and stay without.
--
-- Only for an emergency where something unexpectedly depended on the Data API
-- roles. Prefer fixing the dependency.
--
-- HOW TO RUN — as `postgres`:
--   psql "$SUPERUSER_DIRECT_URL" -f db/roles/004_revoke_api_role_grants_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  obj record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '004 rollback must run as postgres; current_user = %', current_user;
  END IF;

  FOR obj IN
    SELECT c.oid::regclass AS name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relowner = 'postgres'::regrole
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  LOOP
    IF obj.relkind = 'S' THEN
      EXECUTE format('GRANT ALL ON SEQUENCE %s TO anon, authenticated', obj.name);
    ELSE
      EXECUTE format('GRANT ALL ON TABLE %s TO anon, authenticated', obj.name);
    END IF;
  END LOOP;

  FOR obj IN
    SELECT p.oid::regprocedure AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proowner = 'postgres'::regrole
  LOOP
    EXECUTE format('GRANT ALL ON FUNCTION %s TO anon, authenticated', obj.name);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated;

COMMIT;
