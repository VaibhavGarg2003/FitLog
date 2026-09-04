-- F7 — Covering indexes for foreign keys that lacked one
-- ═══════════════════════════════════════════════════════
--
-- Cascade deletes from users scan every child table; meal_foods.food_id needs
-- to locate referencing rows for ON DELETE SET NULL. Honestly low urgency at
-- current size — argued for correctness of delete paths, not query latency.
--
-- exercise_sets.exercise_id is included here; session_id already had an index
-- from the init migration. The F1 uniqueness migration also added
-- exercise_id via schema @@index — this migration is the DDL that lands it.

CREATE INDEX "meal_foods_meal_entry_id_idx" ON "meal_foods" ("meal_entry_id");
CREATE INDEX "meal_foods_food_id_idx" ON "meal_foods" ("food_id");
CREATE INDEX "exercise_sets_exercise_id_idx" ON "exercise_sets" ("exercise_id");
CREATE INDEX "goals_user_id_idx" ON "goals" ("user_id");
CREATE INDEX "workout_templates_user_id_idx" ON "workout_templates" ("user_id");
