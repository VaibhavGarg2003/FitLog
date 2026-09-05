-- F3 — Database-level CHECK constraints (NOT VALID only)
-- ═══════════════════════════════════════════════════════
--
-- These are an OUTER SANITY ENVELOPE, not a mirror of Zod. Product bounds
-- (e.g. per-set rpe 1–5) are tighter than physical impossibility (rpe 1–10).
-- Production may hold rows that violate product policy but not physics; a
-- check mirroring Zod would fail on existing data.
--
-- NOT VALID is unconditionally safe and already guards every future write —
-- that is the security property we actually want.
--
-- ⚠ NO VALIDATE CONSTRAINT anywhere under prisma/migrations/.
-- prisma migrate deploy applies every unapplied migration in directory order,
-- so a committed validation migration would run automatically on the next
-- deploy and fail against violating production data.
--
-- Operator path (outside migrate deploy):
--   1. db/preflight/check_constraint_violations.sql  (read-only counts)
--   2. when zero rows: db/validate/001_validate_constraints.sql as postgres

-- ── exercise_sets ──────────────────────────────────────────────────
ALTER TABLE "exercise_sets"
  ADD CONSTRAINT "exercise_sets_weight_check"
  CHECK ("weight" IS NULL OR ("weight" > 0 AND "weight" <= 2000))
  NOT VALID;

ALTER TABLE "exercise_sets"
  ADD CONSTRAINT "exercise_sets_reps_check"
  CHECK ("reps" IS NULL OR ("reps" > 0 AND "reps" <= 1000))
  NOT VALID;

ALTER TABLE "exercise_sets"
  ADD CONSTRAINT "exercise_sets_rpe_check"
  CHECK ("rpe" IS NULL OR ("rpe" BETWEEN 1 AND 10))
  NOT VALID;

ALTER TABLE "exercise_sets"
  ADD CONSTRAINT "exercise_sets_set_number_check"
  CHECK ("set_number" > 0 AND "set_number" <= 1000)
  NOT VALID;

-- ── workout_sessions ───────────────────────────────────────────────
ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_duration_min_check"
  CHECK ("duration_min" IS NULL OR ("duration_min" > 0 AND "duration_min" <= 1440))
  NOT VALID;

ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_rpe_check"
  CHECK ("rpe" IS NULL OR ("rpe" BETWEEN 1 AND 10))
  NOT VALID;

ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_calories_burned_low_check"
  CHECK ("calories_burned_low" IS NULL OR "calories_burned_low" >= 0)
  NOT VALID;

ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_calories_burned_high_check"
  CHECK ("calories_burned_high" IS NULL OR "calories_burned_high" >= 0)
  NOT VALID;

-- ── meal_foods ─────────────────────────────────────────────────────
ALTER TABLE "meal_foods"
  ADD CONSTRAINT "meal_foods_macros_nonneg_check"
  CHECK ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)
  NOT VALID;

ALTER TABLE "meal_foods"
  ADD CONSTRAINT "meal_foods_quantity_check"
  CHECK ("quantity" > 0)
  NOT VALID;

-- ── foods ──────────────────────────────────────────────────────────
ALTER TABLE "foods"
  ADD CONSTRAINT "foods_calories_per_100g_check"
  CHECK ("calories_per_100g" >= 0 AND "calories_per_100g" <= 2000)
  NOT VALID;

ALTER TABLE "foods"
  ADD CONSTRAINT "foods_protein_per_100g_check"
  CHECK ("protein_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "foods"
  ADD CONSTRAINT "foods_carbs_per_100g_check"
  CHECK ("carbs_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "foods"
  ADD CONSTRAINT "foods_fat_per_100g_check"
  CHECK ("fat_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "foods"
  ADD CONSTRAINT "foods_fiber_per_100g_check"
  CHECK ("fiber_per_100g" IS NULL OR "fiber_per_100g" >= 0)
  NOT VALID;

-- ── custom_foods ───────────────────────────────────────────────────
ALTER TABLE "custom_foods"
  ADD CONSTRAINT "custom_foods_calories_per_100g_check"
  CHECK ("calories_per_100g" >= 0 AND "calories_per_100g" <= 2000)
  NOT VALID;

ALTER TABLE "custom_foods"
  ADD CONSTRAINT "custom_foods_protein_per_100g_check"
  CHECK ("protein_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "custom_foods"
  ADD CONSTRAINT "custom_foods_carbs_per_100g_check"
  CHECK ("carbs_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "custom_foods"
  ADD CONSTRAINT "custom_foods_fat_per_100g_check"
  CHECK ("fat_per_100g" >= 0)
  NOT VALID;

ALTER TABLE "custom_foods"
  ADD CONSTRAINT "custom_foods_fiber_per_100g_check"
  CHECK ("fiber_per_100g" IS NULL OR "fiber_per_100g" >= 0)
  NOT VALID;

-- ── weight_logs ────────────────────────────────────────────────────
ALTER TABLE "weight_logs"
  ADD CONSTRAINT "weight_logs_weight_kg_check"
  CHECK ("weight_kg" > 0 AND "weight_kg" <= 700)
  NOT VALID;

-- ── step_logs ──────────────────────────────────────────────────────
ALTER TABLE "step_logs"
  ADD CONSTRAINT "step_logs_count_check"
  CHECK ("count" >= 0 AND "count" <= 200000)
  NOT VALID;

-- ── profiles ───────────────────────────────────────────────────────
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_age_check"
  CHECK ("age" IS NULL OR ("age" > 0 AND "age" < 130))
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_height_cm_check"
  CHECK ("height_cm" IS NULL OR "height_cm" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_weight_kg_check"
  CHECK ("weight_kg" IS NULL OR "weight_kg" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_tdee_check"
  CHECK ("tdee" IS NULL OR "tdee" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_target_calories_check"
  CHECK ("target_calories" IS NULL OR "target_calories" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_target_protein_check"
  CHECK ("target_protein" IS NULL OR "target_protein" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_target_carbs_check"
  CHECK ("target_carbs" IS NULL OR "target_carbs" >= 0)
  NOT VALID;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_target_fat_check"
  CHECK ("target_fat" IS NULL OR "target_fat" >= 0)
  NOT VALID;

-- ── goals ──────────────────────────────────────────────────────────
ALTER TABLE "goals"
  ADD CONSTRAINT "goals_target_value_check"
  CHECK ("target_value" > 0)
  NOT VALID;

ALTER TABLE "goals"
  ADD CONSTRAINT "goals_start_value_check"
  CHECK ("start_value" > 0)
  NOT VALID;

ALTER TABLE "goals"
  ADD CONSTRAINT "goals_dates_check"
  CHECK ("target_date" >= "start_date")
  NOT VALID;
