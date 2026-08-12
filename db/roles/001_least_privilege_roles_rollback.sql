-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 001_least_privilege_roles.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns everything to `postgres` and removes both roles.
--
-- ⚠ BEFORE RUNNING: point DATABASE_URL and DIRECT_URL back at the postgres
--    credential in Vercel and in your local .env files. If you drop the roles
--    while anything is still connecting as them, that connection dies.
--
--   psql "$SUPERUSER_DIRECT_URL" -f db/roles/001_least_privilege_roles_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠ TWO TRANSACTIONS, same reason as the apply script: membership must be
--   committed before it can be used by DROP OWNED BY.

\set ON_ERROR_STOP on

-- ───────────────────────────────────────────────────────────────────────────
-- TRANSACTION 1 — take membership of both roles.
--
--   `DROP OWNED BY <role>` fails with
--       42501: permission denied to drop objects
--       DETAIL: Only roles with privileges of role "fitlog_app" may drop
--               objects owned by it.
--   unless postgres is a member of that role. The apply script grants
--   membership of fitlog_migrate but deliberately NOT of fitlog_app, so both
--   are (re-)granted here. Found by running this rollback against dev.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Must run as postgres, not %', current_user;
  END IF;
END $$;

GRANT fitlog_migrate TO postgres WITH INHERIT TRUE, SET TRUE;
GRANT fitlog_app     TO postgres WITH INHERIT TRUE, SET TRUE;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- TRANSACTION 2 — reassign, strip privileges, drop the roles.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1. Ownership back to postgres — CATALOG-DRIVEN, not a hardcoded list.
--
--    An earlier version of this file listed all 16 tables and 15 enums by name.
--    That is version-locked: any table, enum, sequence, index or function created
--    by a LATER Prisma migration would still be owned by fitlog_migrate, and
--    `DROP ROLE` would then fail with "role cannot be dropped because some
--    objects depend on it".
--
--    REASSIGN OWNED BY moves EVERYTHING the role currently owns, whenever this
--    is run. It stays correct as the schema grows.
REASSIGN OWNED BY fitlog_migrate TO postgres;

-- 1b. Remove the guard trigger and auth helper (steps 7 and 8 of the apply script).
--
--     ⚠ Revert lib/repositories/auth.repository.ts to read auth.users directly
--     BEFORE running this, or /api/auth/identities and /api/auth/password will
--     call a function that no longer exists.
DROP EVENT TRIGGER IF EXISTS protect_cross_service_drop;
DROP EVENT TRIGGER IF EXISTS protect_cross_service_ddl;
DROP FUNCTION IF EXISTS private.assert_cross_service_integrity();
DROP FUNCTION IF EXISTS private.cross_service_fk_drift();
DROP TABLE    IF EXISTS private.cross_service_fk;
DROP FUNCTION IF EXISTS private.user_has_password(uuid);

-- RESTRICT, not CASCADE — deliberately. If anything unexpected has been added to
-- `private` since this was applied, this fails loudly instead of silently
-- deleting it. Inspect and remove such objects by hand, then re-run.
DROP SCHEMA IF EXISTS private RESTRICT;

-- 2. Remove every remaining privilege and default-ACL entry for both roles.
--
--    DROP OWNED BY (after REASSIGN OWNED BY left them owning nothing) deletes
--    the grants held BY the role and the `ALTER DEFAULT PRIVILEGES FOR ROLE`
--    entries it created. PostgreSQL requires those default-privilege entries to
--    be gone before DROP ROLE will succeed.
DROP OWNED BY fitlog_migrate;
DROP OWNED BY fitlog_app;

REVOKE fitlog_migrate FROM postgres;
REVOKE fitlog_app     FROM postgres;

DROP ROLE IF EXISTS fitlog_app;
DROP ROLE IF EXISTS fitlog_migrate;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFIED against the dev project: after this ran, all 27 tables were owned by
-- postgres, all 15 enums were owned by postgres, both roles were gone, and no
-- table or row was lost.
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── Expect: 27 tables owned by postgres, 15 enums, both roles gone ──'
SELECT tableowner, count(*) FROM pg_tables WHERE schemaname='public' GROUP BY 1;
SELECT count(*) AS enums_owned_by_postgres FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname='public' AND t.typtype='e' AND t.typowner='postgres'::regrole;
SELECT rolname FROM pg_roles WHERE rolname IN ('fitlog_app','fitlog_migrate');
