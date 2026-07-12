-- Enable Row Level Security (RLS) on every application table — DENY-ALL lockdown.
--
-- THE HOLE THIS CLOSES:
-- Supabase exposes the `public` schema through an auto-generated PostgREST API
-- at https://<project>.supabase.co/rest/v1/. The anon key needed to call it
-- ships in the browser bundle (it must, for auth). With RLS disabled, the
-- `anon` and `authenticated` roles could read and write EVERY row of EVERY
-- table directly through that API — bypassing all of the app-layer auth in
-- our Next.js routes. Docs called RLS the "second wall"; it was never built.
--
-- WHY DENY-ALL (RLS enabled, ZERO policies):
-- The app never touches these tables through PostgREST. All data access goes
-- through Prisma, which connects as the `postgres` role (see DATABASE_URL).
-- RLS is enabled WITHOUT `FORCE`, so the table owner / superuser (`postgres`)
-- BYPASSES it entirely — the app is completely unaffected. Meanwhile any
-- request arriving as `anon` or `authenticated` matches no policy and is
-- therefore denied every row. Nothing to read, nothing to write.
--
-- If a table ever legitimately needs client-side (anon-key) access, add
-- explicit `CREATE POLICY` statements for it in a LATER migration. Until then,
-- deny-all is the correct, safest default.

ALTER TABLE "users"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profiles"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_sessions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercise_sets"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_entries"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_foods"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weight_logs"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "step_logs"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goal_checkpoints"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "foods"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercises"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_insights"   ENABLE ROW LEVEL SECURITY;
