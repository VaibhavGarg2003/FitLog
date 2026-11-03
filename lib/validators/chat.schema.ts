/**
 * Buddies + chat request schemas (Zod)
 * ════════════════════════════════════
 *
 * Same house rule as api.schema.ts: nothing reaches a service unvalidated.
 * The database repeats the important limits as CHECK constraints.
 *
 * Message ids are BIGINT in Postgres and travel as decimal STRINGS — a JS
 * number silently rounds past 2^53. messageIdSchema parses them to bigint.
 */

import { z } from "zod";
import { HANDLE_PATTERN, normalizeHandle } from "@/lib/social/handle";

export const MESSAGE_MAX_CHARS = 2000;
export const MESSAGE_PAGE_MAX = 50;
const MAX_BIGINT = BigInt("9223372036854775807");

/** Decimal string → bigint, within Postgres BIGINT range. */
export const messageIdSchema = z
  .string()
  .regex(/^\d{1,19}$/, "Invalid message id")
  .transform((s) => BigInt(s))
  .refine((n) => n <= MAX_BIGINT, "Invalid message id");

export const userIdSchema = z.string().uuid("Invalid user id").toLowerCase();
export const conversationIdSchema = z.string().uuid("Invalid conversation id");

export const handleSchema = z
  .string()
  .max(40)
  .transform(normalizeHandle)
  .refine(
    (h) => HANDLE_PATTERN.test(h),
    "3–20 characters: lowercase letters, numbers and _"
  );

export const inviteCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Invalid invite code");

// ─── PUT /api/social/profile ─────────────────────────────────
export const claimHandleSchema = z.object({ handle: handleSchema });

// ─── PATCH /api/social/profile ───────────────────────────────
export const socialPreferencesSchema = z.object({
  readReceipts: z.boolean(),
});

// ─── POST /api/buddies/requests ──────────────────────────────
export const buddyRequestSchema = z.union([
  z.object({ handle: handleSchema }).strict(),
  z.object({ inviteCode: inviteCodeSchema }).strict(),
]);

// ─── POST /api/buddies/[userId] ──────────────────────────────
export const buddyRespondSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
});

// ─── POST /api/blocks ────────────────────────────────────────
export const blockSchema = z.object({ userId: userIdSchema });

// ─── POST /api/reports ───────────────────────────────────────
export const reportSchema = z.object({
  userId: userIdSchema,
  messageId: messageIdSchema.optional(),
  reason: z.enum(["SPAM", "HARASSMENT", "INAPPROPRIATE", "OTHER"]),
  details: z.string().trim().max(500).optional(),
});

// ─── POST /api/chat/conversations ────────────────────────────
export const startConversationSchema = z.object({ userId: userIdSchema });

// ─── POST /api/chat/conversations/[id]/messages ──────────────
export const sendMessageSchema = z.object({
  clientMessageId: z.string().uuid().toLowerCase(),
  body: z
    .string()
    .trim()
    .min(1, "Message is empty")
    .max(MESSAGE_MAX_CHARS, `Messages are limited to ${MESSAGE_MAX_CHARS} characters`),
});

// ─── GET /api/chat/conversations/[id]/messages ───────────────
export const messagesQuerySchema = z
  .object({
    before: messageIdSchema.optional(),
    after: messageIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MESSAGE_PAGE_MAX).default(30),
  })
  .refine((q) => !(q.before !== undefined && q.after !== undefined), {
    message: "Use either before or after, not both",
  });

// ─── POST /api/chat/conversations/[id]/read ──────────────────
export const markReadSchema = z.object({
  lastReadMessageId: messageIdSchema,
});
