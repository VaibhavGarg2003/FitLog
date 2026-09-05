-- F1 — Exercise set uniqueness + F2 historical stale-session backfill
-- ════════════════════════════════════════════════════════════════════
--
-- ORDER IS LOAD-BEARING. Do not rearrange steps 1–4.
--
-- Retention rule: a row that is both a duplicate AND non-positive set_number
-- is resolved AS A DUPLICATE FIRST, on its stored values. Renumbering before
-- dedupe would turn [0,0,1] into [1,2,3], laundering duplicates into
-- permanently-distinct rows.
--
-- Why this order is safe: the unique indexes land only after dedupe and
-- renumbering, so the renumber step may pass through intermediate values
-- harmlessly. Once every set_number is positive and unique per
-- (session, exercise), the app's ascending delete-renumber loop is
-- collision-free.

-- 1. Add the optional client idempotency key (nullable — multi-NULL unique OK).
ALTER TABLE "exercise_sets" ADD COLUMN "client_request_id" TEXT;

-- 2. Dedupe on (session_id, exercise_id, set_number), keep earliest by
--    (created_at, id).
DELETE FROM "exercise_sets" a USING "exercise_sets" b
WHERE a."session_id" = b."session_id"
  AND a."exercise_id" = b."exercise_id"
  AND a."set_number"  = b."set_number"
  AND (a."created_at" > b."created_at"
       OR (a."created_at" = b."created_at" AND a."id" > b."id"));

-- 3. Renumber any (session_id, exercise_id) group that still contains a
--    set_number < 1, using a stable order so the result is contiguous 1..n.
WITH needs_renumber AS (
  SELECT "session_id", "exercise_id"
  FROM "exercise_sets"
  GROUP BY "session_id", "exercise_id"
  HAVING MIN("set_number") < 1
),
ranked AS (
  SELECT es."id",
         ROW_NUMBER() OVER (
           PARTITION BY es."session_id", es."exercise_id"
           ORDER BY es."set_number", es."created_at", es."id"
         ) AS new_num
  FROM "exercise_sets" es
  INNER JOIN needs_renumber n
    ON n."session_id" = es."session_id"
   AND n."exercise_id" = es."exercise_id"
)
UPDATE "exercise_sets" es
SET "set_number" = ranked.new_num
FROM ranked
WHERE es."id" = ranked."id";

-- 4. Unique indexes (only after data is clean).
CREATE UNIQUE INDEX "exercise_sets_session_id_exercise_id_set_number_key"
  ON "exercise_sets" ("session_id", "exercise_id", "set_number");

CREATE UNIQUE INDEX "exercise_sets_session_id_client_request_id_key"
  ON "exercise_sets" ("session_id", "client_request_id");

-- ────────────────────────────────────────────────────────────────────
-- F2 backfill — one-time historical cleanup of abandoned IN_PROGRESS rows.
--
-- Threshold is deliberately 7 days, NOT the runtime 24h policy
-- (STALE_SESSION_TIMEOUT_HOURS in workout.service.ts). The two values are
-- different on purpose: a TypeScript constant cannot be shared with SQL, and
-- a conservative backfill is safer than inventing duration/RPE for sessions
-- the user never finished.
-- ────────────────────────────────────────────────────────────────────

-- Empty stale sessions: pure noise, delete.
DELETE FROM "workout_sessions" ws
WHERE ws."status" = 'IN_PROGRESS'
  AND ws."updated_at" < now() - interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM "exercise_sets" es WHERE es."session_id" = ws."id"
  );

-- DELIBERATELY NOT DONE: cancelling stale sessions that HAVE sets.
--
-- An earlier version of this migration marked them CANCELLED. That was wrong.
-- A session with sets is a record of training that actually happened; the only
-- thing missing is the finish metadata. Cancelling it would hide real workouts
-- (getSessionsByDate filters CANCELLED) and make them reject new sets
-- (lockActiveSessionForUser requires IN_PROGRESS) — which breaks the very real
-- user who returns days later to add to, or finish, an earlier session.
--
-- They stay IN_PROGRESS: visible, editable, finishable, indefinitely.
-- CANCELLED is reserved for a workout the user explicitly discards.
