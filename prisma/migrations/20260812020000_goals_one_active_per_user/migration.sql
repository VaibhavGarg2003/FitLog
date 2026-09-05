-- F4 — At most one ACTIVE goal per user
-- ═════════════════════════════════════
--
-- Partial unique index: only rows with status = 'ACTIVE' participate.
-- Prisma cannot express partial indexes in schema.prisma; this index is
-- intentionally SQL-only (same class of decision as the RLS lockdown
-- migration — migrate diff does not model it as a Prisma field).
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Prisma
-- 7.8 detects CONCURRENTLY and skips wrapping this migration in a
-- transaction. Do not remove CONCURRENTLY without understanding lock impact.

-- 1. De-duplicate: keep the newest ACTIVE goal per user, abandon the rest.
UPDATE "goals" g
SET "status" = 'ABANDONED'
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "user_id"
           ORDER BY "created_at" DESC, "id" DESC
         ) AS rn
  FROM "goals"
  WHERE "status" = 'ACTIVE'
) d
WHERE g."id" = d."id"
  AND d.rn > 1;

-- 2. Partial unique index — one ACTIVE row per user_id.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "goals_one_active_per_user"
  ON "goals" ("user_id")
  WHERE "status" = 'ACTIVE';
