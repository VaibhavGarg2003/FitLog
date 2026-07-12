-- One MealEntry per (user, date, mealType).
--
-- WHY: logFood() used find-then-create inside a transaction. Two concurrent
-- requests (double-tap on flaky WiFi) could both see "no entry" and both
-- create one — duplicate LUNCH entries whose foods then render inconsistently.
-- A transaction does not prevent two SEPARATE transactions from interleaving
-- reads; only a unique constraint lets the database arbitrate.
--
-- Before adding the constraint we must merge any duplicates that already
-- exist: repoint their foods to the oldest entry, then delete the extras.

-- Step 1: repoint meal_foods from duplicate entries to the keeper (oldest).
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY user_id, date, meal_type
           ORDER BY created_at ASC, id ASC
         ) AS keeper_id
  FROM meal_entries
)
UPDATE meal_foods mf
SET meal_entry_id = r.keeper_id
FROM ranked r
WHERE mf.meal_entry_id = r.id
  AND r.id <> r.keeper_id;

-- Step 2: delete the now-empty duplicate entries.
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY user_id, date, meal_type
           ORDER BY created_at ASC, id ASC
         ) AS keeper_id
  FROM meal_entries
)
DELETE FROM meal_entries me
USING ranked r
WHERE me.id = r.id
  AND r.id <> r.keeper_id;

-- Step 3: the constraint itself.
CREATE UNIQUE INDEX "meal_entries_user_id_date_meal_type_key"
  ON "meal_entries"("user_id", "date", "meal_type");
