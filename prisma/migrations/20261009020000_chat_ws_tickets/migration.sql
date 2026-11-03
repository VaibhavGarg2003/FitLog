-- Live-chat WebSocket admission tickets
-- ═════════════════════════════════════
--
-- Next.js inserts one row per issued ticket (only the SHA-256 of the ticket's
-- random id, never the ticket itself). The Django WebSocket server consumes it
-- with a single UPDATE … WHERE consumed_at IS NULL AND expires_at > now(), so
-- a ticket admits exactly one connection — across restarts and overlapping
-- deploys, which an in-memory "used ids" set could not guarantee (Codex
-- review, 2026-10-09). Django gets SELECT/UPDATE on this table only through
-- its restricted runtime role (db/roles/005_django_runtime_role.sql).
--
-- DDL is `prisma migrate diff` output, verbatim; CHECK + RLS appended.
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: additive only.

-- CreateTable
CREATE TABLE "chat_ws_tickets" (
    "jti_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_ws_tickets_pkey" PRIMARY KEY ("jti_hash")
);

-- CreateIndex
CREATE INDEX "chat_ws_tickets_user_id_created_at_idx" ON "chat_ws_tickets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_ws_tickets_expires_at_idx" ON "chat_ws_tickets"("expires_at");

-- AddForeignKey
ALTER TABLE "chat_ws_tickets" ADD CONSTRAINT "chat_ws_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Value constraints ───────────────────────────────────────────────
ALTER TABLE "chat_ws_tickets"
  ADD CONSTRAINT "chat_ws_tickets_jti_hash_check"
  CHECK ("jti_hash" ~ '^[0-9a-f]{64}$');

-- ── Row Level Security ──────────────────────────────────────────────
ALTER TABLE "chat_ws_tickets" ENABLE ROW LEVEL SECURITY;
