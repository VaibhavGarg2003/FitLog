-- Target history — fill profiles that onboarded without any history row
-- ══════════════════════════════════════════════════════════════════════
--
-- WHY: 20260913010000_target_revisions backfilled every onboarded profile that
-- existed when it ran (2026-09-13). The code that writes a history row on
-- onboarding deployed later (2026-09-15, #8). Anyone who onboarded between
-- the two was created by the OLD code, so they have targets on their profile
-- but no history at all — every past day reads as "target unknown" until they
-- happen to save Settings. Production had exactly one such profile.
--
-- WHAT: the same honest backfill as 20260913010000, but ONLY for onboarded
-- profiles with no target_revisions row whatsoever:
--   • effective from updated_at's (UTC) day — the targets are only known to
--     hold since the profile was last written; earlier days stay "unknown";
--   • marked BACKFILL so any consumer can tell it apart;
--   • profiles missing a target, or holding values the table's checks reject,
--     are skipped rather than failing the migration.
--
-- IDEMPOTENT: NOT EXISTS makes a second run insert nothing, and a user who has
-- saved Settings since (so already has a PROFILE_UPDATE row) is left alone.
-- Additive only — safe to apply before or after the code deploys.

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
  AND (p."weight_kg" IS NULL OR p."weight_kg" >= 0)
  AND NOT EXISTS (
    SELECT 1 FROM "target_revisions" r WHERE r."user_id" = p."user_id"
  );
