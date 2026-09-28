-- Period reports — weekly / monthly / quarterly / yearly AI reviews
-- ══════════════════════════════════════════════════════════════════
--
-- 1. profiles.insight_plan: which reports a user gets — weekly coaching +
--    monthly review (default) or monthly only. Monthly and longer reviews are
--    for everyone. NOT NULL with a constant default is a catalog-only change
--    in Postgres 11+ (no table rewrite); existing users get the default.
-- 2. period_insights: one row per user per report period (all four types),
--    with a generation lease (status/lease_token/lease_expires_at/attempts)
--    and the facts snapshot + hash each report was written from.
-- 3. Copy weekly_insights in as legacy WEEK rows. weekly_insights itself is
--    left untouched (read-only from now on) and dropped in a later release —
--    db/roles and the reset scripts still name it.
--
-- DDL below matches `prisma migrate diff` output for the schema exactly
-- (names included). Hand-assembled because a diff against the live database
-- also proposes dropping the Django-owned tables.
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: additive only; old code never reads
-- the new column or table.

-- CreateEnum
CREATE TYPE "InsightPlan" AS ENUM ('WEEKLY_AND_MONTHLY', 'MONTHLY_ONLY');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "insight_plan" "InsightPlan" NOT NULL DEFAULT 'WEEKLY_AND_MONTHLY';

-- CreateTable
CREATE TABLE "period_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_type" "PeriodType" NOT NULL,
    "period_start" DATE NOT NULL,
    "covered_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "status" "InsightStatus" NOT NULL DEFAULT 'GENERATING',
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,
    "highlights" JSONB DEFAULT '[]',
    "suggestion" TEXT,
    "facts" JSONB,
    "facts_hash" TEXT,
    "stats_version" INTEGER NOT NULL DEFAULT 1,
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One report per user per period. Also the archive's lookup index, and with
-- user_id leading it covers the FK for cascade deletes.
CREATE UNIQUE INDEX "period_insights_user_id_period_type_period_start_key" ON "period_insights"("user_id", "period_type", "period_start");

-- AddForeignKey
-- CASCADE: account deletion removes a user's reports with them.
ALTER TABLE "period_insights" ADD CONSTRAINT "period_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Value constraints ───────────────────────────────────────────────
-- The table is empty here and the copy below satisfies them, so they
-- validate immediately.
ALTER TABLE "period_insights"
  ADD CONSTRAINT "period_insights_dates_check"
  CHECK ("period_start" <= "covered_start" AND "covered_start" <= "period_end");

ALTER TABLE "period_insights"
  ADD CONSTRAINT "period_insights_attempts_check"
  CHECK ("attempts" BETWEEN 0 AND 10);

-- ── Row Level Security ──────────────────────────────────────────────
-- Deny-all, matching 20260712010000_enable_rls_lockdown (the rls_auto_enable
-- event trigger should already have done it; stated here so a database
-- without the trigger still gets it). Idempotent.
ALTER TABLE "period_insights" ENABLE ROW LEVEL SECURITY;

-- ── Copy the old weekly insights ────────────────────────────────────
-- They covered "this week so far" when generated (often a partial week), so
-- they are marked legacy: shown in the archive as the old weekly coach, never
-- checked for staleness (their facts were never hashed). attempts = 1 leaves
-- one regeneration available, the same allowance a new report gets.
INSERT INTO "period_insights" (
    "id", "user_id", "period_type", "period_start", "covered_start", "period_end",
    "partial", "status", "attempts", "content", "highlights", "suggestion",
    "facts", "provider", "legacy", "generated_at", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    w."user_id",
    'WEEK',
    w."week_start",
    w."week_start",
    w."week_start" + 6,
    false,
    'READY',
    1,
    w."content",
    COALESCE(w."highlights", '[]'::jsonb),
    w."suggestion",
    w."metadata",
    w."provider",
    true,
    w."created_at",
    w."created_at",
    CURRENT_TIMESTAMP
FROM "weekly_insights" w
ON CONFLICT ("user_id", "period_type", "period_start") DO NOTHING;
