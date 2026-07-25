-- ═══════════════════════════════════════════════════════════════
-- 1. custom_foods — user-owned, editable food entries
-- ═══════════════════════════════════════════════════════════════
-- The seeded `foods` table is reference data with no owner, so it cannot hold
-- "my whey protein". This table can. Same per-100g shape as `foods` so both
-- can be merged into one search result list.

CREATE TABLE "custom_foods" (
    "id"                TEXT NOT NULL,
    "user_id"           TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "category"          TEXT,
    "calories_per_100g" DOUBLE PRECISION NOT NULL,
    "protein_per_100g"  DOUBLE PRECISION NOT NULL,
    "carbs_per_100g"    DOUBLE PRECISION NOT NULL,
    "fat_per_100g"      DOUBLE PRECISION NOT NULL,
    "fiber_per_100g"    DOUBLE PRECISION,
    "default_unit"      TEXT NOT NULL DEFAULT 'g',
    "default_grams"     DOUBLE PRECISION NOT NULL DEFAULT 100,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_foods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custom_foods_user_id_idx" ON "custom_foods"("user_id");

-- One row per (user, name): editing your whey updates the existing row rather
-- than piling up near-duplicates, which is what makes a brand switch apply to
-- every future log.
CREATE UNIQUE INDEX "custom_foods_user_id_name_key" ON "custom_foods"("user_id", "name");

ALTER TABLE "custom_foods"
    ADD CONSTRAINT "custom_foods_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS, matching 20260712010000_enable_rls_lockdown. The app reaches
-- this table only through Prisma as the `postgres` role, which bypasses RLS;
-- anon/authenticated match no policy and are denied every row.
ALTER TABLE "custom_foods" ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 2. Collapse the three branded whey rows into one generic entry
-- ═══════════════════════════════════════════════════════════════
-- WHY: shipping brand-named label data is third-party trade-name content that
-- also goes stale on reformulation, and no list is ever complete. One honest
-- average plus per-user custom macros serves everyone better.
--
-- ORDER MATTERS. meal_foods.food_id references foods(id) with the default
-- RESTRICT, so deleting a referenced row would abort the migration. Every
-- meal_foods row already stores its own name/calories/macros snapshot, so
-- nulling the FK preserves the user's history exactly — only the link to the
-- reference row is dropped.

-- 2a. Promote one existing row in place, so anything still pointing at it keeps
--     a valid target, and re-seeding won't create a duplicate.
UPDATE "foods"
SET "name"              = 'Whey Protein',
    "calories_per_100g" = 382,
    "protein_per_100g"  = 78.3,
    "carbs_per_100g"    = 8.5,
    "fat_per_100g"      = 3.2,
    "fiber_per_100g"    = 0,
    "default_unit"      = 'scoop',
    "default_quantity"  = 1,
    "default_grams"     = 30
WHERE "name" = 'Whey Protein (ON Gold Standard)';

-- 2b. Detach logged meals from the two rows about to disappear.
UPDATE "meal_foods"
SET "food_id" = NULL
WHERE "food_id" IN (
    SELECT "id" FROM "foods"
    WHERE "name" IN ('Whey Protein (MuscleBlaze)', 'Whey Protein (MyProtein Impact)')
);

-- 2c. Now safe to remove.
DELETE FROM "foods"
WHERE "name" IN ('Whey Protein (MuscleBlaze)', 'Whey Protein (MyProtein Impact)');

-- 2d. Safety net for databases seeded before 2a's source row existed under that
--     exact name — guarantees exactly one generic row afterwards.
INSERT INTO "foods" (
    "id", "name", "source", "category",
    "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "fiber_per_100g",
    "default_unit", "default_quantity", "default_grams", "restaurant_multiplier", "is_verified"
)
SELECT
    gen_random_uuid()::TEXT, 'Whey Protein', 'MANUAL', 'Supplement',
    382, 78.3, 8.5, 3.2, 0,
    'scoop', 1, 30, 1.5, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "foods" WHERE "name" = 'Whey Protein');
