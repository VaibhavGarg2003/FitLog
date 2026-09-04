-- Reaper candidate-scan index
-- ═══════════════════════════
--
-- reapStaleSessions runs synchronously on every "Start workout" and its
-- candidate query is:
--
--   WHERE user_id = $1 AND status = 'IN_PROGRESS' AND updated_at < $2
--     AND NOT EXISTS (SELECT 1 FROM exercise_sets WHERE session_id = ws.id)
--
-- Sessions that hold sets are deliberately preserved as IN_PROGRESS forever
-- (they are records of real training — see the reaper's header comment), so
-- the candidate set grows with a user's history of unfinished workouts.
--
-- Without an index matching that predicate, Postgres falls back to
-- (user_id, date) or a sequential scan and filters in memory, so start-workout
-- latency tracks that unbounded history. This index seeks straight to the
-- stale rows; the anti-join is then a single probe each against the existing
-- exercise_sets(session_id) index.
--
-- Deliberately NOT denormalising a has_sets flag: that buys a smaller scan at
-- the cost of a derived column two write paths must keep true, which is a
-- worse trade at this scale. Revisit only if this index stops being enough.

CREATE INDEX "workout_sessions_user_id_status_updated_at_idx"
  ON "workout_sessions" ("user_id", "status", "updated_at");
