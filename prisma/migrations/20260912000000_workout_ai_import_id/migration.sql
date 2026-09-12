-- AI workout import — session-level idempotency key
-- ═════════════════════════════════════════════════
--
-- WHY A SESSION-LEVEL KEY WHEN SETS ALREADY HAVE ONE:
-- exercise_sets.client_request_id is unique per (session_id, client_request_id),
-- so a retried import that APPENDS to an existing session is already a no-op.
-- It does not cover the import that also FINISHES the session: the retry finds
-- no IN_PROGRESS session for that date, starts a second one, and logs the whole
-- workout again. This column gives the retry a way to find its own first
-- attempt before it does that.
--
-- Nullable on purpose. Postgres treats NULLs as distinct in a unique index, so
-- every manually started session keeps (user_id, NULL) without colliding; only
-- real import ids are constrained.

ALTER TABLE "workout_sessions" ADD COLUMN "ai_import_id" TEXT;

CREATE UNIQUE INDEX "workout_sessions_user_id_ai_import_id_key"
  ON "workout_sessions" ("user_id", "ai_import_id");
