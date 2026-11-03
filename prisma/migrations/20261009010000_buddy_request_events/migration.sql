-- Buddy request events (quota ledger)
-- ═══════════════════════════════════
--
-- One append-only row per buddy request actually sent. The daily request
-- quota (social.service.ts) counts these rows under the requester's advisory
-- lock. Counting buddyships rows was wrong: re-requesting the same person
-- reuses the pair's single row, so cancel/decline/block-unblock cycles never
-- raised the count (Codex review, 2026-10-09). Pruned after 2 days by the
-- chat retention job.
--
-- DDL is `prisma migrate diff` output, verbatim; RLS appended.
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: additive only.

-- CreateTable
CREATE TABLE "buddy_request_events" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buddy_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "buddy_request_events_requester_id_created_at_idx" ON "buddy_request_events"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "buddy_request_events_created_at_idx" ON "buddy_request_events"("created_at");

-- AddForeignKey
ALTER TABLE "buddy_request_events" ADD CONSTRAINT "buddy_request_events_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Row Level Security ──────────────────────────────────────────────
-- Deny-all, matching every other table (idempotent).
ALTER TABLE "buddy_request_events" ENABLE ROW LEVEL SECURITY;
