-- Target history — remember what a user's nutrition targets were on any day
-- ════════════════════════════════════════════════════════════════════════
--
-- THE PROBLEM THIS STOPS:
-- profiles.target_calories (and protein/carbs/fat/tdee) hold only the CURRENT
-- value and are overwritten on every recalculation. A user who cut at 1,800
-- kcal Jan–Mar and bulked at 2,600 from April has no record of the 1,800 once
-- April's save lands — so any later look at March is judged against 2,600.
-- Every day this table does not exist, more of that history is destroyed.
--
-- DDL below matches `prisma migrate diff` output for the TargetRevision model
-- exactly (names included), so Prisma sees no drift. Hand-assembled rather than
-- generated because the diff against the live database also proposes dropping
-- the Django-owned tables (auth_*, django_*, share_links).
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: a new table old code never reads.

-- CreateEnum
CREATE TYPE "TargetSource" AS ENUM ('ONBOARDING', 'PROFILE_UPDATE', 'BACKFILL');

-- CreateTable
CREATE TABLE "target_revisions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "tdee" INTEGER,
    "target_calories" INTEGER NOT NULL,
    "target_protein" INTEGER NOT NULL,
    "target_carbs" INTEGER NOT NULL,
    "target_fat" INTEGER NOT NULL,
    "goal" "FitnessGoal",
    "weight_kg" DOUBLE PRECISION,
    "source" "TargetSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per user per calendar day. Doubles as the lookup index for "latest
-- row on or before date D" and, with user_id leading, covers the FK.
CREATE UNIQUE INDEX "target_revisions_user_id_effective_from_key" ON "target_revisions"("user_id", "effective_from");

-- AddForeignKey
-- CASCADE: account deletion removes history with the user, like every other
-- user-owned table (no change needed in account.repository.ts).
ALTER TABLE "target_revisions" ADD CONSTRAINT "target_revisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Value constraints ───────────────────────────────────────────────
-- Same bounds as the matching profiles columns (20260812010000_value_constraints).
-- The table is empty here and the backfill below only copies rows that satisfy
-- them, so these validate immediately — no NOT VALID.
ALTER TABLE "target_revisions"
  ADD CONSTRAINT "target_revisions_tdee_check"
  CHECK ("tdee" IS NULL OR "tdee" >= 0);

ALTER TABLE "target_revisions"
  ADD CONSTRAINT "target_revisions_targets_check"
  CHECK (
    "target_calories" >= 0 AND "target_protein" >= 0
    AND "target_carbs" >= 0 AND "target_fat" >= 0
  );

ALTER TABLE "target_revisions"
  ADD CONSTRAINT "target_revisions_weight_kg_check"
  CHECK ("weight_kg" IS NULL OR "weight_kg" >= 0);

-- ── Row Level Security ──────────────────────────────────────────────
-- Deny-all, matching 20260712010000_enable_rls_lockdown. The rls_auto_enable
-- event trigger (db/roles/000_rls_auto_enable.sql) should already have done
-- this on CREATE TABLE; stating it here keeps the guarantee in the migration
-- itself, so a database without the trigger (local, CI, a restore) still gets
-- it. Idempotent — a no-op when RLS is already on.
ALTER TABLE "target_revisions" ENABLE ROW LEVEL SECURITY;

-- ── Backfill: one honest row per existing onboarded profile ─────────
-- We cannot know anyone's PAST targets — only that the current ones have held
-- since the profile was last written. So every row is effective from
-- updated_at's day:
--
--   • Never edited since signup: updated_at is the signup moment, so this is
--     the signup day — the targets really have held since then.
--   • Edited later: the current targets are only known to hold since that
--     last write. Days before it get NO row, which reads as "target unknown" —
--     never a guess.
--
-- Deliberately NOT "created_at when the two timestamps are close": created at
-- 23:58 and edited at 00:02 would date the edited targets to the day BEFORE
-- they existed. updated_at also moves for writes that are not target changes;
-- that only makes the start later than the truth, erring toward "unknown".
--
-- DEPLOY ORDER: run this migration BEFORE the code that fills timezones ships.
-- That code writes profiles (bumping updated_at), which would push every
-- backfilled start date to the day it ran — still correct, but less history.
--
-- Dates: updated_at is a UTC timestamp, and no timezones exist yet,
-- so ::date is the UTC calendar day — at most one day off for users far from
-- UTC. Rows are marked BACKFILL so any consumer can tell.
--
-- Profiles missing any target, or holding values the checks above reject,
-- are skipped rather than failing the whole migration.
INSERT INTO "target_revisions" (
    "id", "user_id", "effective_from",
    "tdee", "target_calories", "target_protein", "target_carbs", "target_fat",
    "goal", "weight_kg", "source", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    p."user_id",
    p."updated_at"::date,
    p."tdee",
    p."target_calories",
    p."target_protein",
    p."target_carbs",
    p."target_fat",
    p."goal",
    p."weight_kg",
    'BACKFILL',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "profiles" p
WHERE p."is_onboarded"
  AND p."target_calories" >= 0
  AND p."target_protein"  >= 0
  AND p."target_carbs"    >= 0
  AND p."target_fat"      >= 0
  AND (p."tdee" IS NULL OR p."tdee" >= 0)
  AND (p."weight_kg" IS NULL OR p."weight_kg" >= 0);
