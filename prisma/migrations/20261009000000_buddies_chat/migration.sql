-- Buddies + 1:1 chat
-- ══════════════════
--
-- Opt-in social layer: social_profiles (@handle, invite code, read-receipt
-- preference), buddyships (one row per user pair), user_blocks, 1:1
-- conversations with exactly two conversation_members, messages, and
-- user_reports. See schema.prisma "BUDDIES + CHAT" for the model notes.
--
-- DDL below is `prisma migrate diff --from-schema <previous> --to-schema
-- prisma/schema.prisma` output, verbatim. Hand-assembled (rather than diffed
-- against a live database) because a diff against the live database also
-- proposes dropping the Django-owned tables. CHECK constraints and RLS, which
-- Prisma does not model, are appended after it.
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOYS: additive only; old code never reads
-- these tables.

-- CreateEnum
CREATE TYPE "BuddyshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateTable
CREATE TABLE "social_profiles" (
    "user_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "read_receipts" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "buddyships" (
    "id" TEXT NOT NULL,
    "user_low_id" TEXT NOT NULL,
    "user_high_id" TEXT NOT NULL,
    "status" "BuddyshipStatus" NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "cooldown_user_id" TEXT,
    "cooldown_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buddyships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user_low_id" TEXT NOT NULL,
    "user_high_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_message_id" BIGINT NOT NULL DEFAULT 0,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "client_message_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT,
    "reported_user_id" TEXT,
    "message_id" BIGINT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "evidence" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_handle_key" ON "social_profiles"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_invite_code_key" ON "social_profiles"("invite_code");

-- CreateIndex
CREATE INDEX "buddyships_user_high_id_status_idx" ON "buddyships"("user_high_id", "status");

-- CreateIndex
CREATE INDEX "buddyships_requested_by_id_requested_at_idx" ON "buddyships"("requested_by_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "buddyships_user_low_id_user_high_id_key" ON "buddyships"("user_low_id", "user_high_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "conversations_user_high_id_idx" ON "conversations"("user_high_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user_low_id_user_high_id_key" ON "conversations"("user_low_id", "user_high_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_conversation_id_idx" ON "conversation_members"("user_id", "conversation_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_id_idx" ON "messages"("conversation_id", "id");

-- CreateIndex
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_id_client_message_id_key" ON "messages"("sender_id", "client_message_id");

-- CreateIndex
CREATE INDEX "user_reports_reporter_id_created_at_idx" ON "user_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "user_reports_reported_user_id_idx" ON "user_reports"("reported_user_id");

-- CreateIndex
CREATE INDEX "user_reports_created_at_idx" ON "user_reports"("created_at");

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buddyships" ADD CONSTRAINT "buddyships_user_low_id_fkey" FOREIGN KEY ("user_low_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buddyships" ADD CONSTRAINT "buddyships_user_high_id_fkey" FOREIGN KEY ("user_high_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_low_id_fkey" FOREIGN KEY ("user_low_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_high_id_fkey" FOREIGN KEY ("user_high_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_sender_id_fkey" FOREIGN KEY ("conversation_id", "sender_id") REFERENCES "conversation_members"("conversation_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Value constraints ───────────────────────────────────────────────
-- Zod validates first; these make the database refuse bad rows from any
-- writer, including raw SQL. All tables are empty here, so they validate
-- immediately.

-- Handles are lowercase so uniqueness is case-insensitive without citext.
ALTER TABLE "social_profiles"
  ADD CONSTRAINT "social_profiles_handle_check"
  CHECK ("handle" ~ '^[a-z0-9_]{3,20}$');

-- 16 random bytes, base64url, no padding.
ALTER TABLE "social_profiles"
  ADD CONSTRAINT "social_profiles_invite_code_check"
  CHECK ("invite_code" ~ '^[A-Za-z0-9_-]{22}$');

-- One row per pair: the lower id (byte order, matching the "C" comparison
-- the app uses) always goes in user_low_id.
ALTER TABLE "buddyships"
  ADD CONSTRAINT "buddyships_pair_order_check"
  CHECK ("user_low_id" COLLATE "C" < "user_high_id" COLLATE "C");

ALTER TABLE "buddyships"
  ADD CONSTRAINT "buddyships_requester_in_pair_check"
  CHECK ("requested_by_id" IN ("user_low_id", "user_high_id"));

ALTER TABLE "buddyships"
  ADD CONSTRAINT "buddyships_cooldown_check"
  CHECK (
    ("cooldown_user_id" IS NULL AND "cooldown_until" IS NULL)
    OR ("cooldown_user_id" IN ("user_low_id", "user_high_id") AND "cooldown_until" IS NOT NULL)
  );

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_not_self_check"
  CHECK ("blocker_id" <> "blocked_id");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_pair_order_check"
  CHECK ("user_low_id" COLLATE "C" < "user_high_id" COLLATE "C");

ALTER TABLE "conversation_members"
  ADD CONSTRAINT "conversation_members_last_read_check"
  CHECK ("last_read_message_id" >= 0);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_body_length_check"
  CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_client_message_id_check"
  CHECK ("client_message_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

ALTER TABLE "user_reports"
  ADD CONSTRAINT "user_reports_details_length_check"
  CHECK ("details" IS NULL OR char_length("details") <= 500);

ALTER TABLE "user_reports"
  ADD CONSTRAINT "user_reports_evidence_length_check"
  CHECK ("evidence" IS NULL OR char_length("evidence") <= 2000);

-- ── Row Level Security ──────────────────────────────────────────────
-- Deny-all, matching 20260712010000_enable_rls_lockdown (the rls_auto_enable
-- event trigger should already have done it; stated here so a database
-- without the trigger still gets it). Idempotent.
ALTER TABLE "social_profiles"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buddyships"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_blocks"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_reports"         ENABLE ROW LEVEL SECURITY;
