-- Preflight: count rows that would violate each proposed CHECK predicate.
-- ══════════════════════════════════════════════════════════════════════
--
-- READ-ONLY. Safe to run against production as any role that can SELECT.
-- Returns one row per constraint with a violation_count.
--
-- Operator path (deliberately outside prisma migrate deploy):
--   1. Run this file. Every violation_count must be 0.
--   2. Only then run db/validate/001_validate_constraints.sql as postgres
--      (the break-glass credential — NOT DIRECT_URL / fitlog_migrate).
--
-- Why this sits outside migrate deploy: a VALIDATE CONSTRAINT migration would
-- run automatically on the next deploy and fail against violating data.
-- See prisma/migrations/20260812010000_value_constraints.

SELECT 'exercise_sets_weight_check' AS constraint_name, COUNT(*) AS violation_count
FROM "exercise_sets"
WHERE NOT ("weight" IS NULL OR ("weight" > 0 AND "weight" <= 2000))

UNION ALL
SELECT 'exercise_sets_reps_check', COUNT(*)
FROM "exercise_sets"
WHERE NOT ("reps" IS NULL OR ("reps" > 0 AND "reps" <= 1000))

UNION ALL
SELECT 'exercise_sets_rpe_check', COUNT(*)
FROM "exercise_sets"
WHERE NOT ("rpe" IS NULL OR ("rpe" BETWEEN 1 AND 10))

UNION ALL
SELECT 'exercise_sets_set_number_check', COUNT(*)
FROM "exercise_sets"
WHERE NOT ("set_number" > 0 AND "set_number" <= 1000)

UNION ALL
SELECT 'workout_sessions_duration_min_check', COUNT(*)
FROM "workout_sessions"
WHERE NOT ("duration_min" IS NULL OR ("duration_min" > 0 AND "duration_min" <= 1440))

UNION ALL
SELECT 'workout_sessions_rpe_check', COUNT(*)
FROM "workout_sessions"
WHERE NOT ("rpe" IS NULL OR ("rpe" BETWEEN 1 AND 10))

UNION ALL
SELECT 'workout_sessions_calories_burned_low_check', COUNT(*)
FROM "workout_sessions"
WHERE NOT ("calories_burned_low" IS NULL OR "calories_burned_low" >= 0)

UNION ALL
SELECT 'workout_sessions_calories_burned_high_check', COUNT(*)
FROM "workout_sessions"
WHERE NOT ("calories_burned_high" IS NULL OR "calories_burned_high" >= 0)

UNION ALL
SELECT 'meal_foods_macros_nonneg_check', COUNT(*)
FROM "meal_foods"
WHERE NOT ("calories" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0)

UNION ALL
SELECT 'meal_foods_quantity_check', COUNT(*)
FROM "meal_foods"
WHERE NOT ("quantity" > 0)

UNION ALL
SELECT 'foods_calories_per_100g_check', COUNT(*)
FROM "foods"
WHERE NOT ("calories_per_100g" >= 0 AND "calories_per_100g" <= 2000)

UNION ALL
SELECT 'foods_protein_per_100g_check', COUNT(*)
FROM "foods"
WHERE NOT ("protein_per_100g" >= 0)

UNION ALL
SELECT 'foods_carbs_per_100g_check', COUNT(*)
FROM "foods"
WHERE NOT ("carbs_per_100g" >= 0)

UNION ALL
SELECT 'foods_fat_per_100g_check', COUNT(*)
FROM "foods"
WHERE NOT ("fat_per_100g" >= 0)

UNION ALL
SELECT 'foods_fiber_per_100g_check', COUNT(*)
FROM "foods"
WHERE NOT ("fiber_per_100g" IS NULL OR "fiber_per_100g" >= 0)

UNION ALL
SELECT 'custom_foods_calories_per_100g_check', COUNT(*)
FROM "custom_foods"
WHERE NOT ("calories_per_100g" >= 0 AND "calories_per_100g" <= 2000)

UNION ALL
SELECT 'custom_foods_protein_per_100g_check', COUNT(*)
FROM "custom_foods"
WHERE NOT ("protein_per_100g" >= 0)

UNION ALL
SELECT 'custom_foods_carbs_per_100g_check', COUNT(*)
FROM "custom_foods"
WHERE NOT ("carbs_per_100g" >= 0)

UNION ALL
SELECT 'custom_foods_fat_per_100g_check', COUNT(*)
FROM "custom_foods"
WHERE NOT ("fat_per_100g" >= 0)

UNION ALL
SELECT 'custom_foods_fiber_per_100g_check', COUNT(*)
FROM "custom_foods"
WHERE NOT ("fiber_per_100g" IS NULL OR "fiber_per_100g" >= 0)

UNION ALL
SELECT 'weight_logs_weight_kg_check', COUNT(*)
FROM "weight_logs"
WHERE NOT ("weight_kg" > 0 AND "weight_kg" <= 700)

UNION ALL
SELECT 'step_logs_count_check', COUNT(*)
FROM "step_logs"
WHERE NOT ("count" >= 0 AND "count" <= 200000)

UNION ALL
SELECT 'profiles_age_check', COUNT(*)
FROM "profiles"
WHERE NOT ("age" IS NULL OR ("age" > 0 AND "age" < 130))

UNION ALL
SELECT 'profiles_height_cm_check', COUNT(*)
FROM "profiles"
WHERE NOT ("height_cm" IS NULL OR "height_cm" >= 0)

UNION ALL
SELECT 'profiles_weight_kg_check', COUNT(*)
FROM "profiles"
WHERE NOT ("weight_kg" IS NULL OR "weight_kg" >= 0)

UNION ALL
SELECT 'profiles_tdee_check', COUNT(*)
FROM "profiles"
WHERE NOT ("tdee" IS NULL OR "tdee" >= 0)

UNION ALL
SELECT 'profiles_target_calories_check', COUNT(*)
FROM "profiles"
WHERE NOT ("target_calories" IS NULL OR "target_calories" >= 0)

UNION ALL
SELECT 'profiles_target_protein_check', COUNT(*)
FROM "profiles"
WHERE NOT ("target_protein" IS NULL OR "target_protein" >= 0)

UNION ALL
SELECT 'profiles_target_carbs_check', COUNT(*)
FROM "profiles"
WHERE NOT ("target_carbs" IS NULL OR "target_carbs" >= 0)

UNION ALL
SELECT 'profiles_target_fat_check', COUNT(*)
FROM "profiles"
WHERE NOT ("target_fat" IS NULL OR "target_fat" >= 0)

UNION ALL
SELECT 'goals_target_value_check', COUNT(*)
FROM "goals"
WHERE NOT ("target_value" > 0)

UNION ALL
SELECT 'goals_start_value_check', COUNT(*)
FROM "goals"
WHERE NOT ("start_value" > 0)

UNION ALL
SELECT 'goals_dates_check', COUNT(*)
FROM "goals"
WHERE NOT ("target_date" >= "start_date")

ORDER BY constraint_name;
