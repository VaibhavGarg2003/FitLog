-- ═══════════════════════════════════════════════════════════════════════════
-- 005 — fitlog_django: least-privilege runtime role for the Django service
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS SOLVES
-- ────────────────
-- The Django service (share links, Django Admin over foods, and now the
-- live-chat WebSocket server) has been connecting as `postgres` — the role
-- that owns Django's tables and can do anything to the database. A bug or a
-- leaked DATABASE_URL in an internet-facing WebSocket process would have the
-- whole database as its blast radius. Codex's review required fixing this
-- BEFORE the live-chat sockets go live.
--
-- fitlog_django gets exactly what the running service does, nothing more:
--
--   Django's own tables (auth_*, django_*)  SELECT/INSERT/UPDATE/DELETE
--                                           (admin logins, sessions, admin log)
--   django_migrations                       SELECT (migrations run by hand,
--                                           as postgres — see DEPLOY.md)
--   share_links                             SELECT/INSERT/UPDATE
--   workout_templates                       SELECT/INSERT (share snapshots + copy)
--   users                                   SELECT (id, name) only — no emails
--   foods                                   SELECT/INSERT/UPDATE/DELETE (admin)
--   chat_ws_tickets                         SELECT (jti_hash, user_id,
--                                           expires_at, consumed_at),
--                                           UPDATE (consumed_at) only
--
-- No access to chat messages, conversations, profiles, workouts, nutrition…
-- The WebSocket server never reads chat content: relay events carry ids only.
--
-- BYPASSRLS like fitlog_app: every public table has deny-all RLS (zero
-- policies), so a normal role would see no rows at all. Its reach is bounded
-- by the GRANTs above instead.
--
-- Foreign-key checks on share_links → users / workout_templates → users run
-- with the table OWNER's rights, so no REFERENCES grant is needed.
--
-- HOW TO RUN — as `postgres`:
--
--   psql "$SUPERUSER_DIRECT_URL" \
--     -v django_password="$(openssl rand -hex 32)" \
--     -f db/roles/005_django_runtime_role.sql
--
-- Then set Render's DATABASE_URL to the SESSION pooler with this role:
--   postgresql://fitlog_django.<project-ref>:<password>@<pooler-host>:5432/postgres
-- (Render free has no IPv6 — never the direct db.<ref>.supabase.co host.)
-- Django migrations keep running by hand as postgres (DEPLOY.md).
--
-- Re-runnable: the role is created once; grants are idempotent. The password
-- variable is only used on first creation.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '005 must run as postgres; current_user = %', current_user;
  END IF;
END $$;

SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitlog_django') AS need_role \gset
\if :need_role
CREATE ROLE fitlog_django
  LOGIN PASSWORD :'django_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT BYPASSRLS;
\endif

COMMENT ON ROLE fitlog_django IS
  'Django service runtime (share links, admin, live-chat sockets). '
  'Least privilege — see db/roles/005_django_runtime_role.sql. '
  'Migrations still run as postgres.';

GRANT USAGE ON SCHEMA public TO fitlog_django;

-- Django's own tables (owned by postgres; created by Django migrations).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.auth_group,
  public.auth_group_permissions,
  public.auth_permission,
  public.auth_user,
  public.auth_user_groups,
  public.auth_user_user_permissions,
  public.django_admin_log,
  public.django_content_type,
  public.django_session
TO fitlog_django;
GRANT SELECT ON public.django_migrations TO fitlog_django;

GRANT USAGE, SELECT ON
  public.auth_group_id_seq,
  public.auth_group_permissions_id_seq,
  public.auth_permission_id_seq,
  public.auth_user_id_seq,
  public.auth_user_groups_id_seq,
  public.auth_user_user_permissions_id_seq,
  public.django_admin_log_id_seq,
  public.django_content_type_id_seq
TO fitlog_django;

-- Share links (Django-owned) and the FitLog rows they read / copy into.
GRANT SELECT, INSERT, UPDATE ON public.share_links TO fitlog_django;
GRANT SELECT, INSERT ON public.workout_templates TO fitlog_django;
GRANT SELECT (id, name) ON public.users TO fitlog_django;

-- Django Admin over the food catalogue.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foods TO fitlog_django;

-- Live chat: consume WebSocket admission tickets, nothing else.
GRANT SELECT (jti_hash, user_id, expires_at, consumed_at)
  ON public.chat_ws_tickets TO fitlog_django;
GRANT UPDATE (consumed_at) ON public.chat_ws_tickets TO fitlog_django;

-- ── Verify ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('fitlog_django', 'public.messages', 'SELECT')
     OR has_table_privilege('fitlog_django', 'public.conversations', 'SELECT')
     OR has_column_privilege('fitlog_django', 'public.users', 'email', 'SELECT')
     OR has_table_privilege('fitlog_django', 'public.chat_ws_tickets', 'DELETE')
     OR has_table_privilege('fitlog_django', 'public.share_links', 'TRUNCATE') THEN
    RAISE EXCEPTION '005 verification failed: fitlog_django has more access than intended';
  END IF;
  IF NOT has_column_privilege('fitlog_django', 'public.chat_ws_tickets', 'consumed_at', 'UPDATE')
     OR NOT has_table_privilege('fitlog_django', 'public.share_links', 'INSERT')
     OR NOT has_column_privilege('fitlog_django', 'public.users', 'name', 'SELECT') THEN
    RAISE EXCEPTION '005 verification failed: fitlog_django is missing a required grant';
  END IF;
  RAISE NOTICE '005 verified: fitlog_django has exactly the intended access.';
END $$;

COMMIT;
