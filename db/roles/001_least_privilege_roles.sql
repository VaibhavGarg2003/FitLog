-- ═══════════════════════════════════════════════════════════════════════════
-- 001 — Least-privilege database roles
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS SOLVES
-- ────────────────
-- Today the Next.js app AND Prisma migrations both connect as `postgres`,
-- which OWNS the database. That means one mistyped command
-- (`prisma migrate dev` / `prisma db push` / `migrate reset` pointed at prod)
-- can run `DROP SCHEMA public CASCADE` and destroy the 11 Django-owned tables
-- (auth_*, django_*, share_links) that live in this same database.
--
-- Nothing in the Next.js repo mentions those tables, so nothing warns you.
--
-- THE FIX: separate identities, enforced by Postgres — not by discipline.
--
--   postgres        (unchanged)  owns the DATABASE and the 11 Django tables.
--                                Django keeps using this. Break-glass only.
--
--   fitlog_migrate  (new)        Prisma's DDL identity → DIRECT_URL
--                                Owns ONLY Prisma's 16 tables + 15 enums.
--                                Does NOT own schema public  → cannot DROP it.
--                                Does NOT own Django tables  → cannot DROP them.
--
--   fitlog_app      (new)        Runtime identity → DATABASE_URL (pooler)
--                                SELECT/INSERT/UPDATE/DELETE only.
--                                No ownership at all → cannot DROP or ALTER
--                                anything, ever. This is what Vercel gets.
--
-- After this runs, `prisma migrate reset` against prod fails with a permission
-- error instead of destroying data. The catastrophe becomes an error message.
--
-- WHY `postgres` IS NOT SUPERUSER HERE
-- ────────────────────────────────────
-- Verified on this instance: postgres has rolsuper=false, bypassrls=true,
-- createrole=true, and owns database `postgres`. Because it is NOT a superuser,
-- a role that does not own an object genuinely cannot drop it. That is the
-- property this whole script depends on.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW TO RUN — as `postgres`, via DIRECT connection (port 5432, NOT the pooler)
--
--   psql "$SUPERUSER_DIRECT_URL" \
--     -v migrate_password="$(openssl rand -hex 32)" \
--     -v app_password="$(openssl rand -hex 32)" \
--     -f db/roles/001_least_privilege_roles.sql
--
-- ⚠ Use `-hex`, NEVER `-base64`. Base64 emits `/`, `+` and `=`, which are
--   reserved in a connection URI and must be percent-encoded. Pasted raw into
--   DATABASE_URL they cause a connection failure that looks like a bad password.
--   Hex is [0-9a-f] only, so it is always URI-safe.
--
-- Print the generated passwords BEFORE running and store them in your secret
-- manager. They are never written to this file or to git.
--
-- Rollback: db/roles/001_least_privilege_roles_rollback.sql
-- Runbook:  db/roles/README.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠ THIS SCRIPT USES **TWO** TRANSACTIONS, DELIBERATELY.
--
-- Role-membership changes are not visible to privilege checks inside the same
-- transaction that made them. Step 6 (`ALTER DEFAULT PRIVILEGES FOR ROLE
-- fitlog_migrate`) needs the membership from step 4 to already be committed,
-- otherwise it fails with:
--     ERROR: 42501: must be able to SET ROLE "fitlog_migrate"
--
-- Verified empirically against the dev project (qoqmmwewvoodgdompqrn).
-- Do not merge these into one transaction.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ───────────────────────────────────────────────────────────────────────────
-- TRANSACTION 1 — create roles and establish membership.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Preflight. Refuse to run if assumptions do not hold.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_roles int;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Must run as postgres, not %', current_user;
  END IF;

  -- Ownership transfer requires we currently own the objects.
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND tableowner <> 'postgres'
  ) THEN
    RAISE EXCEPTION 'public.users is not owned by postgres — this script has '
                    'likely already run. Inspect before re-running.';
  END IF;

  -- PARTIAL-STATE DETECTION.
  -- This script runs as two transactions. If the psql session dies between them,
  -- transaction 1 is committed (both roles exist, postgres is a member of
  -- fitlog_migrate) while transaction 2 has changed nothing — so `users` is still
  -- owned by postgres and the check above passes. A naive re-run would then get
  -- as far as CREATE ROLE and fail with "role already exists", leaving the
  -- operator unsure what state they are in.
  SELECT count(*) INTO n_roles
  FROM pg_roles WHERE rolname IN ('fitlog_migrate', 'fitlog_app');

  IF n_roles > 0 THEN
    RAISE EXCEPTION
      'PARTIAL STATE: % of 2 roles already exist but ownership has not moved. '
      'Transaction 1 committed and transaction 2 did not. '
      'RECOVERY: either run db/roles/001_least_privilege_roles_rollback.sql to '
      'get back to a clean slate and start over, or skip transaction 1 and run '
      'transaction 2 only (from "TRANSACTION 2" to the final COMMIT). Do not '
      'simply re-run this file.', n_roles;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Create the two roles.
--
--    NOSUPERUSER NOCREATEDB NOCREATEROLE — these are working identities, they
--    must never be able to escalate.
--
--    fitlog_app gets BYPASSRLS because every table has RLS enabled with ZERO
--    policies (see migration 20260712010000_enable_rls_lockdown). Without
--    BYPASSRLS this role reads 0 rows from every table and the site goes down
--    instantly. Authorization is enforced in server code, not in RLS — RLS
--    here exists to keep the PostgREST API closed.
--    `postgres` has bypassrls=true, so it is permitted to grant this.
-- ───────────────────────────────────────────────────────────────────────────
CREATE ROLE fitlog_migrate
  LOGIN PASSWORD :'migrate_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT;

CREATE ROLE fitlog_app
  LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT BYPASSRLS;

COMMENT ON ROLE fitlog_migrate IS
  'Prisma DDL identity (DIRECT_URL). Owns Prisma objects only. Cannot drop '
  'schema public or any Django table. Created by db/roles/001.';
COMMENT ON ROLE fitlog_app IS
  'Next.js runtime identity (DATABASE_URL via pooler). DML only, no DDL, no '
  'ownership. BYPASSRLS required because RLS is on with no policies. '
  'Created by db/roles/001.';

-- ───────────────────────────────────────────────────────────────────────────
-- 1b. Membership — MUST be granted and COMMITTED before anything below.
--
--     Two separate reasons this cannot wait until later in the script:
--
--     (a) `ALTER TABLE ... OWNER TO fitlog_migrate` requires the current role to
--         be a member of fitlog_migrate. Without it, step 3 fails with
--         `42501: must be able to SET ROLE "fitlog_migrate"`.
--     (b) `ALTER DEFAULT PRIVILEGES FOR ROLE fitlog_migrate` (step 6) needs the
--         same membership.
--
--     And it must be in its OWN transaction: a membership granted inside a
--     transaction is not visible to privilege checks later in that same
--     transaction. Both failures were reproduced against the dev project.
--
--     Functionally this also keeps the `ensure_rls` event trigger working —
--     see the note at step 4.
-- ───────────────────────────────────────────────────────────────────────────
GRANT fitlog_migrate TO postgres WITH INHERIT TRUE, SET TRUE;

COMMIT;   -- ← everything below depends on this being committed

-- ───────────────────────────────────────────────────────────────────────────
-- TRANSACTION 2 — schema access, ownership, and privileges.
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Schema-level access.
--
--    CREATE on schema is what lets Prisma add NEW tables. It is deliberately
--    NOT given to fitlog_app.
--
--    Neither role OWNS schema public (owner stays pg_database_owner), which is
--    precisely what blocks `DROP SCHEMA public CASCADE`.
-- ───────────────────────────────────────────────────────────────────────────
GRANT USAGE, CREATE ON SCHEMA public TO fitlog_migrate;
GRANT USAGE          ON SCHEMA public TO fitlog_app;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Transfer ownership of Prisma's objects to fitlog_migrate.
--
--    Listed EXPLICITLY rather than looped, so this can never accidentally
--    sweep up a Django table. 16 tables = 15 Prisma models + _prisma_migrations.
--    Verified against prisma/schema.prisma.
--
--    Owning these is what lets `prisma migrate deploy` ALTER them.
--    An owner also bypasses RLS on its own tables, so migrations that read
--    data still work.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public._prisma_migrations  OWNER TO fitlog_migrate;
ALTER TABLE public.users               OWNER TO fitlog_migrate;
ALTER TABLE public.profiles            OWNER TO fitlog_migrate;
ALTER TABLE public.workout_sessions    OWNER TO fitlog_migrate;
ALTER TABLE public.exercise_sets       OWNER TO fitlog_migrate;
ALTER TABLE public.meal_entries        OWNER TO fitlog_migrate;
ALTER TABLE public.meal_foods          OWNER TO fitlog_migrate;
ALTER TABLE public.weight_logs         OWNER TO fitlog_migrate;
ALTER TABLE public.step_logs           OWNER TO fitlog_migrate;
ALTER TABLE public.goals               OWNER TO fitlog_migrate;
ALTER TABLE public.goal_checkpoints    OWNER TO fitlog_migrate;
ALTER TABLE public.foods               OWNER TO fitlog_migrate;
ALTER TABLE public.custom_foods        OWNER TO fitlog_migrate;
ALTER TABLE public.exercises           OWNER TO fitlog_migrate;
ALTER TABLE public.workout_templates   OWNER TO fitlog_migrate;
ALTER TABLE public.weekly_insights     OWNER TO fitlog_migrate;

-- Enum types must move too. `ALTER TYPE ... ADD VALUE` in any future Prisma
-- migration requires ownership of the type. Miss these and the next migration
-- that adds an enum value fails in production.
ALTER TYPE public."Sex"               OWNER TO fitlog_migrate;
ALTER TYPE public."ActivityLevel"     OWNER TO fitlog_migrate;
ALTER TYPE public."FitnessGoal"       OWNER TO fitlog_migrate;
ALTER TYPE public."Strictness"        OWNER TO fitlog_migrate;
ALTER TYPE public."WorkoutSplit"      OWNER TO fitlog_migrate;
ALTER TYPE public."WorkoutMode"       OWNER TO fitlog_migrate;
ALTER TYPE public."SessionStatus"     OWNER TO fitlog_migrate;
ALTER TYPE public."MealType"          OWNER TO fitlog_migrate;
ALTER TYPE public."LoggingPath"       OWNER TO fitlog_migrate;
ALTER TYPE public."StepSource"        OWNER TO fitlog_migrate;
ALTER TYPE public."FoodSource"        OWNER TO fitlog_migrate;
ALTER TYPE public."ExerciseCategory"  OWNER TO fitlog_migrate;
ALTER TYPE public."GoalStatus"        OWNER TO fitlog_migrate;
ALTER TYPE public."UnitSystem"        OWNER TO fitlog_migrate;
ALTER TYPE public."DietaryType"       OWNER TO fitlog_migrate;

-- NOTE: the 9 sequences in this schema (auth_*_id_seq, django_*_id_seq) all
-- belong to Django tables and are deliberately NOT touched. Prisma's models
-- use text/uuid ids and own no sequences.

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Keep the RLS auto-enable event trigger working.
--
--    public.rls_auto_enable() is SECURITY DEFINER owned by `postgres`, and the
--    `ensure_rls` event trigger fires it on every CREATE TABLE. It runs
--    `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, which requires ownership.
--
--    Once fitlog_migrate owns new tables, postgres is no longer the owner, so
--    that ALTER would fail — and the function swallows errors
--    (EXCEPTION WHEN OTHERS THEN RAISE LOG), so it would fail SILENTLY and new
--    tables would stop getting RLS with no visible sign.
--
--    Making postgres a member of fitlog_migrate restores the ownership check.
--    This grants privilege in the safe direction: postgres (already the most
--    privileged role) gains rights over Prisma's tables. fitlog_migrate gains
--    nothing over Django's.
--
--    That membership is granted in step 1b, which is why 1b must run — and
--    commit — before this point.
--
--    NOTE (Supabase-specific): when `postgres` creates a role, Supabase records
--    the implicit membership with grantor=supabase_admin and
--    set_option=false, inherit_option=false, admin_option=true. So postgres can
--    ADMINISTER the new role but cannot act as it until the explicit GRANT in
--    step 1b adds a second membership row (grantor=postgres) with both options
--    true. Effective rights are the union of all membership rows.
-- ───────────────────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Runtime privileges for fitlog_app — data only, never structure.
-- ───────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.users, public.profiles, public.workout_sessions, public.exercise_sets,
  public.meal_entries, public.meal_foods, public.weight_logs, public.step_logs,
  public.goals, public.goal_checkpoints, public.foods, public.custom_foods,
  public.exercises, public.workout_templates, public.weekly_insights
TO fitlog_app;

-- Read-only on the migration ledger: Prisma Client checks it, must never write.
GRANT SELECT ON public._prisma_migrations TO fitlog_app;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Future tables must not require a manual GRANT.
--
--    Without this, the next `prisma migrate deploy` creates a table the app
--    cannot read, and the failure appears at runtime, in production, as a
--    permission error on a brand-new feature.
--
--    Applies only to objects created BY fitlog_migrate — so a future Django
--    table does not accidentally become readable by the Next.js app.
-- ───────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE fitlog_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fitlog_app;

ALTER DEFAULT PRIVILEGES FOR ROLE fitlog_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fitlog_app;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. ⚠ REQUIRED BEFORE CUTOVER — replace the app's direct read of auth.users.
--
--    lib/repositories/auth.repository.ts (userHasPassword) reads auth.users
--    through the RUNTIME Prisma client, and is called by BOTH
--    /api/auth/identities and /api/auth/password. Its comment says "Prisma
--    connects as `postgres`, which can [read auth]" — exactly the assumption
--    this change breaks. Without this step both endpoints 500 after cutover.
--
--    WHY NOT JUST GRANT ACCESS TO auth.users?
--    Because `postgres` cannot. Verified — the auth schema ACL is:
--        supabase_admin=UC/supabase_admin ... postgres=U/supabase_admin
--    `postgres` has USAGE but WITHOUT grant option, so `GRANT USAGE ON SCHEMA
--    auth TO fitlog_app` silently does nothing (PostgreSQL emits a WARNING, not
--    an error). Only supabase_admin could, and that role is platform-reserved.
--    A column grant on auth.users DOES land, but is unreachable without schema
--    USAGE, so it is useless on its own.
--
--    THE WORKING APPROACH: a SECURITY DEFINER function owned by `postgres`
--    (which does have USAGE on auth). fitlog_app executes the function; it
--    never touches the auth schema itself.
--
--    The function lives in a PRIVATE schema, not `public`. Supabase applies
--    default privileges that automatically grant EXECUTE on new public
--    functions to anon/authenticated — verified: a REVOKE ... FROM PUBLIC was
--    NOT enough, anon could still execute it. In `public` this would have been
--    a user-enumeration oracle at /rest/v1/rpc/user_has_password: anyone with
--    the anon key could probe whether any user id has a password.
--    PostgREST only exposes `public` (and graphql_public), so `private` is
--    unreachable over the API.
-- ───────────────────────────────────────────────────────────────────────────
-- Refuse to co-opt a pre-existing `private` schema. The rollback removes this
-- schema, so if something else already lives here the rollback would destroy
-- unrelated objects. Fail loudly instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private') THEN
    RAISE EXCEPTION
      'Schema "private" already exists. This script expects to create and own '
      'it exclusively, and the rollback deletes it. Inspect its contents and '
      'either remove it or rename this helper schema before continuing.';
  END IF;
END $$;

CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO fitlog_app;

CREATE OR REPLACE FUNCTION private.user_has_password(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog   -- pinned: never resolve names from a caller path
AS $$
  SELECT coalesce(
    (SELECT encrypted_password IS NOT NULL AND encrypted_password <> ''
     FROM auth.users WHERE id = uid),
    false)   -- unknown id returns false, not NULL
$$;

REVOKE ALL ON FUNCTION private.user_has_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_has_password(uuid) TO fitlog_app;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Close the indirect path to Django's data.
--
--    Ownership alone is NOT sufficient. fitlog_migrate owns public.users, and
--    share_links.owner_user_id has a foreign key to it. `DROP TABLE public.users
--    CASCADE` drops that FK constraint as a dependent object — and PostgreSQL
--    does NOT check ownership of the dependent table when cascading.
--
--    Demonstrated on dev BEFORE this trigger existed:
--        users_dropped = TRUE
--        share_links_FKs_remaining = 0   ← Django's constraint destroyed
--        share_links_rows = 4            ← rows survived, integrity did not
--
--    So a role that cannot touch share_links directly could still silently
--    break it. This event trigger closes that path.
--
--    ⚠ MUST be SECURITY INVOKER (the default). Inside a SECURITY DEFINER
--    function `current_user` becomes the function OWNER, so the postgres
--    break-glass check below would always be true and the guard would never
--    fire. That exact mistake was made and caught on dev. The function only
--    needs to RAISE, so it requires no elevated privileges.
-- ───────────────────────────────────────────────────────────────────────────
--    ⚠ THIS CHECKS AN INVARIANT, NOT A LIST OF ATTACKS.
--    A first version enumerated forbidden commands — it matched only a dropped
--    object of type `table` named `users`. Testing on dev then showed that
--        ALTER TABLE public.users DROP CONSTRAINT users_pkey CASCADE
--    sailed straight past it and left share_links_FKs_remaining = 0, because the
--    dropped object was a CONSTRAINT, not a table. Enumerating attacks is
--    whack-a-mole; asserting the invariant covers paths nobody thought of.
--
--    The invariant is registry-based and BIDIRECTIONAL:
--      (A) every registered cross-service FK must still exist, and
--      (B) every cross-owner FK in the catalog must be registered.
--    (A) alone is not enough — and a "recompute cross-owner FKs live" design
--    cannot work at all, because once the FK is dropped the live query simply
--    stops seeing it and has nothing to compare against.
--    (B) stops an unregistered cross-service FK appearing silently.

-- Registry: owned by postgres. fitlog_migrate/fitlog_app get SELECT only, so
-- neither can deregister its way around the guard (verified on dev).
CREATE TABLE private.cross_service_fk (
  child_table   regclass NOT NULL,
  conname       name     NOT NULL,
  parent_table  regclass NOT NULL,
  note          text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_table, conname)   -- constraint names are NOT globally unique
);

-- Auto-populate from the catalog: every FK whose child and parent owners differ.
INSERT INTO private.cross_service_fk (child_table, conname, parent_table, note)
SELECT c.conrelid, c.conname, c.confrelid,
       'auto-registered at install: ' || child.relowner::regrole::text
         || ' -> ' || parent.relowner::regrole::text
FROM pg_constraint c
JOIN pg_class child  ON child.oid  = c.conrelid
JOIN pg_class parent ON parent.oid = c.confrelid
WHERE c.contype = 'f' AND child.relowner <> parent.relowner;

-- fitlog_migrate needs to READ the registry because the guard runs SECURITY
-- INVOKER (see below). fitlog_app does NOT — it never touches the registry.
GRANT USAGE  ON SCHEMA private            TO fitlog_migrate;
GRANT SELECT ON private.cross_service_fk  TO fitlog_migrate;

-- Shared by the event triggers AND usable as a standalone pre-deploy check.
-- Returns zero rows when the catalog and the registry agree.
CREATE FUNCTION private.cross_service_fk_drift()
RETURNS TABLE (problem text, detail text)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  -- (A) registered relationship no longer present in the catalog
  SELECT 'missing'::text,
         coalesce(cn.nspname || '.' || cc.relname, r.child_table::text)
           || '.' || r.conname || ' -> '
           || coalesce(pn.nspname || '.' || pc.relname, r.parent_table::text)
  FROM private.cross_service_fk r
  LEFT JOIN pg_class cc     ON cc.oid = r.child_table
  LEFT JOIN pg_namespace cn ON cn.oid = cc.relnamespace
  LEFT JOIN pg_class pc     ON pc.oid = r.parent_table
  LEFT JOIN pg_namespace pn ON pn.oid = pc.relnamespace
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.contype   = 'f'
      AND c.conrelid  = r.child_table
      AND c.conname   = r.conname
      AND c.confrelid = r.parent_table)
  UNION ALL
  -- (B) cross-owner FK present in the catalog that nobody registered
  SELECT 'unregistered'::text,
         cn.nspname || '.' || child.relname || '.' || c.conname
           || ' -> ' || pn.nspname || '.' || parent.relname
           || '  (owners: ' || child.relowner::regrole::text
           || ' -> ' || parent.relowner::regrole::text || ')'
  FROM pg_constraint c
  JOIN pg_class child  ON child.oid  = c.conrelid
  JOIN pg_namespace cn ON cn.oid     = child.relnamespace
  JOIN pg_class parent ON parent.oid = c.confrelid
  JOIN pg_namespace pn ON pn.oid     = parent.relnamespace
  WHERE c.contype = 'f' AND child.relowner <> parent.relowner
    AND NOT EXISTS (
      SELECT 1 FROM private.cross_service_fk r
      WHERE r.child_table = c.conrelid AND r.conname = c.conname)
$$;

-- ⚠ PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
--   fitlog_migrate has USAGE on `private`. Without these REVOKEs it could call
--   anything that ever lands in this schema. The default-privileges line is the
--   important one: it makes that safe for FUTURE functions too, so a later
--   SECURITY DEFINER helper added here cannot become a public entry point
--   because someone forgot a per-function revoke.
REVOKE ALL ON FUNCTION private.cross_service_fk_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.cross_service_fk_drift() TO fitlog_migrate;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION private.assert_cross_service_integrity()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
DECLARE d record;
BEGIN
  IF current_user = 'postgres' THEN
    RETURN;   -- break-glass, deliberate
  END IF;

  SELECT * INTO d FROM private.cross_service_fk_drift() LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'Blocked: cross-service foreign-key integrity violated (%: %). Use the '
      'postgres break-glass role, and register the change in '
      'private.cross_service_fk in the SAME transaction.', d.problem, d.detail
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION private.assert_cross_service_integrity() FROM PUBLIC;

-- Two triggers, one function: DROP arrives via `sql_drop`, while
-- ALTER ... DROP CONSTRAINT / DROP COLUMN / RENAME CONSTRAINT arrive via
-- `ddl_command_end`. Both are required — verified on dev.
-- Note: revoking PUBLIC EXECUTE does NOT stop the event trigger firing —
-- verified on dev, the full attack matrix is still blocked afterwards.
CREATE EVENT TRIGGER protect_cross_service_drop
  ON sql_drop         EXECUTE FUNCTION private.assert_cross_service_integrity();
CREATE EVENT TRIGGER protect_cross_service_ddl
  ON ddl_command_end  EXECUTE FUNCTION private.assert_cross_service_integrity();

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Runtime role must not be able to delete users.
--
--    `share_links.owner_user_id` is ON DELETE CASCADE, so `DELETE FROM
--    public.users` removes Django's share_links ROWS — verified on dev:
--    4 rows before, 0 after, with no DELETE grant on share_links. Event
--    triggers cannot help; they do not fire on DML.
--
--    The app never deletes users (verified: it deletes custom foods, meal
--    foods, meal entries, exercise sets, sessions and templates — never a
--    user), so the runtime role does not need this privilege. Removing it
--    means a leaked runtime credential cannot wipe share_links this way.
--
--    If an account-deletion feature is added later, grant DELETE back here
--    and implement the cross-service deletion flow described in the README.
-- ───────────────────────────────────────────────────────────────────────────
REVOKE DELETE ON public.users FROM fitlog_app;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — every one of these must hold. Run after COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

\echo '── 1. Ownership split (expect: 11 postgres / 16 fitlog_migrate) ──'
SELECT tableowner, count(*) AS tables
FROM pg_tables WHERE schemaname = 'public'
GROUP BY tableowner ORDER BY 1;

\echo '── 2. fitlog_migrate must NOT own schema public (expect pg_database_owner) ──'
SELECT nspowner::regrole::text AS schema_public_owner
FROM pg_namespace WHERE nspname = 'public';

\echo '── 3. fitlog_migrate has NO privilege on Django tables (expect all false) ──'
SELECT tablename,
       has_table_privilege('fitlog_migrate', 'public.'||quote_ident(tablename), 'DELETE') AS can_delete
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'auth\_%' OR tablename LIKE 'django\_%' OR tablename = 'share_links')
ORDER BY 1;

\echo '── 4. fitlog_app cannot create objects (expect false) ──'
SELECT has_schema_privilege('fitlog_app', 'public', 'CREATE') AS app_can_create;

\echo '── 5. fitlog_app can read data (expect true) ──'
SELECT has_table_privilege('fitlog_app', 'public.users', 'SELECT') AS app_can_select;

\echo '── 6. fitlog_app bypasses RLS (expect true — else the site returns 0 rows) ──'
SELECT rolbypassrls FROM pg_roles WHERE rolname = 'fitlog_app';

\echo '── 7. postgres inherits fitlog_migrate, so ensure_rls still works (expect true) ──'
SELECT pg_has_role('postgres', 'fitlog_migrate', 'USAGE') AS event_trigger_ok;
