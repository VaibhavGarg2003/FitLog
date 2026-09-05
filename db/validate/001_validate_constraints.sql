-- Validate NOT VALID check constraints (operator-run, break-glass only)
-- ═════════════════════════════════════════════════════════════════════
--
-- Run ONLY after db/preflight/check_constraint_violations.sql returns
-- zero violations for every row.
--
-- Run as `postgres` (the break-glass credential), NOT as fitlog_migrate
-- (DIRECT_URL) and never as fitlog_app.
--
-- This file is deliberately OUTSIDE prisma/migrations/. migrate deploy would
-- apply a VALIDATE migration automatically and fail against residual data.

ALTER TABLE "exercise_sets" VALIDATE CONSTRAINT "exercise_sets_weight_check";
ALTER TABLE "exercise_sets" VALIDATE CONSTRAINT "exercise_sets_reps_check";
ALTER TABLE "exercise_sets" VALIDATE CONSTRAINT "exercise_sets_rpe_check";
ALTER TABLE "exercise_sets" VALIDATE CONSTRAINT "exercise_sets_set_number_check";

ALTER TABLE "workout_sessions" VALIDATE CONSTRAINT "workout_sessions_duration_min_check";
ALTER TABLE "workout_sessions" VALIDATE CONSTRAINT "workout_sessions_rpe_check";
ALTER TABLE "workout_sessions" VALIDATE CONSTRAINT "workout_sessions_calories_burned_low_check";
ALTER TABLE "workout_sessions" VALIDATE CONSTRAINT "workout_sessions_calories_burned_high_check";

ALTER TABLE "meal_foods" VALIDATE CONSTRAINT "meal_foods_macros_nonneg_check";
ALTER TABLE "meal_foods" VALIDATE CONSTRAINT "meal_foods_quantity_check";

ALTER TABLE "foods" VALIDATE CONSTRAINT "foods_calories_per_100g_check";
ALTER TABLE "foods" VALIDATE CONSTRAINT "foods_protein_per_100g_check";
ALTER TABLE "foods" VALIDATE CONSTRAINT "foods_carbs_per_100g_check";
ALTER TABLE "foods" VALIDATE CONSTRAINT "foods_fat_per_100g_check";
ALTER TABLE "foods" VALIDATE CONSTRAINT "foods_fiber_per_100g_check";

ALTER TABLE "custom_foods" VALIDATE CONSTRAINT "custom_foods_calories_per_100g_check";
ALTER TABLE "custom_foods" VALIDATE CONSTRAINT "custom_foods_protein_per_100g_check";
ALTER TABLE "custom_foods" VALIDATE CONSTRAINT "custom_foods_carbs_per_100g_check";
ALTER TABLE "custom_foods" VALIDATE CONSTRAINT "custom_foods_fat_per_100g_check";
ALTER TABLE "custom_foods" VALIDATE CONSTRAINT "custom_foods_fiber_per_100g_check";

ALTER TABLE "weight_logs" VALIDATE CONSTRAINT "weight_logs_weight_kg_check";
ALTER TABLE "step_logs" VALIDATE CONSTRAINT "step_logs_count_check";

ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_age_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_height_cm_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_weight_kg_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_tdee_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_target_calories_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_target_protein_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_target_carbs_check";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_target_fat_check";

ALTER TABLE "goals" VALIDATE CONSTRAINT "goals_target_value_check";
ALTER TABLE "goals" VALIDATE CONSTRAINT "goals_start_value_check";
ALTER TABLE "goals" VALIDATE CONSTRAINT "goals_dates_check";
