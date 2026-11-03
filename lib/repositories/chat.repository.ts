/**
 * Chat Repository — conversations, messages, read markers
 * ════════════════════════════════════════════════════════
 *
 * TABLES: conversations, conversation_members, messages (+ buddyships,
 * user_blocks, social_profiles, users for the conversation list).
 *
 * Message ids are BIGINT (bigserial). Inside the server they are `bigint`;
 * they leave through toWireMessage() as decimal strings.
 *
 * ORDERING GUARANTEE: sends are serialised per user pair (social-locks.ts),
 * and the id is allocated by the INSERT that runs under that lock, so within
 * one conversation ids commit in increasing order. "Everything after id X"
 * is therefore a complete catch-up for that conversation. It is NOT a global
 * cursor: ids in different conversations interleave arbitrarily.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import { lockActor, type Tx } from "@/lib/repositories/social-locks";
import type { UserPair } from "@/lib/social/pair";
import type { ConversationCursor } from "@/lib/chat/conversation-cursor";

export interface WireMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
}

type MessageRow = {
  id: bigint;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: Date;
};

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  clientMessageId: true,
  body: true,
  createdAt: true,
} as const;

export function toWireMessage(m: MessageRow): WireMessage {
  return {
    id: m.id.toString(),
    conversationId: m.conversationId,
    senderId: m.senderId,
    clientMessageId: m.clientMessageId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

// ─── Conversations ───────────────────────────────────────────

/**
 * Owner-scoped lookup: the conversation only if `userId` is in it. Null for
 * anyone else's (callers answer 404, never "forbidden").
 */
export async function findConversationForUser(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ userLowId: userId }, { userHighId: userId }],
    },
    select: { id: true, userLowId: true, userHighId: true },
  });
}

/**
 * Get the pair's conversation, creating it with both members if needed.
 * Must run under the pair lock (two "first messages" cannot both create).
 */
export async function getOrCreateConversation(tx: Tx, pair: UserPair): Promise<string> {
  const existing = await tx.conversation.findUnique({
    where: { userLowId_userHighId: { userLowId: pair.low, userHighId: pair.high } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.conversation.create({
    data: {
      userLowId: pair.low,
      userHighId: pair.high,
      members: { create: [{ userId: pair.low }, { userId: pair.high }] },
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Messages ────────────────────────────────────────────────

/** A message this sender already committed with this client id (any conversation). */
export async function findCommittedMessage(
  senderId: string,
  clientMessageId: string,
  tx: Tx | typeof prisma = prisma
): Promise<MessageRow | null> {
  return tx.message.findUnique({
    where: { senderId_clientMessageId: { senderId, clientMessageId } },
    select: MESSAGE_SELECT,
  });
}

export async function countMessagesSince(tx: Tx, senderId: string, since: Date) {
  return tx.message.count({
    where: { senderId, createdAt: { gte: since } },
  });
}

export async function insertMessage(
  tx: Tx,
  data: { conversationId: string; senderId: string; clientMessageId: string; body: string }
): Promise<MessageRow> {
  const message = await tx.message.create({ data, select: MESSAGE_SELECT });
  await tx.conversation.update({
    where: { id: data.conversationId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

/**
 * One page of a conversation, always returned oldest → newest.
 *   before: older history (scroll up)      after: catch-up (reconnect / poll)
 *   neither: the newest page
 * hasMore: another page exists in the requested direction.
 */
export async function listMessages(
  conversationId: string,
  opts: { before?: bigint; after?: bigint; limit: number }
): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const take = opts.limit + 1;

  if (opts.after !== undefined) {
    const rows = await prisma.message.findMany({
      where: { conversationId, id: { gt: opts.after } },
      orderBy: { id: "asc" },
      take,
      select: MESSAGE_SELECT,
    });
    return { messages: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(opts.before !== undefined ? { id: { lt: opts.before } } : {}),
    },
    orderBy: { id: "desc" },
    take,
    select: MESSAGE_SELECT,
  });
  return {
    messages: rows.slice(0, opts.limit).reverse(),
    hasMore: rows.length > opts.limit,
  };
}

/**
 * Move my read marker forward — never backward, and never past the newest
 * message in THIS conversation (an id from another conversation, or one not
 * yet written, is clamped). Returns the marker and whether it moved.
 */
export async function advanceReadMarker(
  conversationId: string,
  userId: string,
  target: bigint
): Promise<{ lastReadMessageId: bigint; advanced: boolean }> {
  const moved = await prisma.$queryRaw<{ last_read_message_id: bigint }[]>`
    WITH newest AS (
      SELECT COALESCE(max(id), 0) AS id FROM messages
      WHERE conversation_id = ${conversationId}
    )
    UPDATE conversation_members m
    SET last_read_message_id = LEAST(${target}::bigint, newest.id),
        last_read_at = now()
    FROM newest
    WHERE m.conversation_id = ${conversationId}
      AND m.user_id = ${userId}
      AND LEAST(${target}::bigint, newest.id) > m.last_read_message_id
    RETURNING m.last_read_message_id
  `;
  if (moved.length > 0) {
    return { lastReadMessageId: moved[0].last_read_message_id, advanced: true };
  }

  const current = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadMessageId: true },
  });
  return { lastReadMessageId: current?.lastReadMessageId ?? BigInt(0), advanced: false };
}

// ─── Conversation list ───────────────────────────────────────

export interface ConversationSummaryRow {
  id: string;
  activity: Date;
  created_at: Date;
  last_message_at: Date | null;
  other_id: string;
  other_name: string | null;
  other_avatar_url: string | null;
  other_handle: string | null;
  my_last_read: bigint;
  other_last_read: bigint;
  receipts_visible: boolean;
  are_buddies: boolean;
  blocked_by_me: boolean;
  blocked_me: boolean;
  last_id: bigint | null;
  last_sender_id: string | null;
  last_body: string | null;
  last_created_at: Date | null;
  unread: number;
}

/** Unread counts stop at this number ("99+" in the UI). */
export const UNREAD_CAP = 100;

/**
 * My conversations (newest activity first), or one of them when
 * `conversationId` is given. One query: the other person, the last message,
 * my unread count, whether we can still message, and — only if BOTH of us
 * share read receipts — how far they have read.
 */
export async function listConversationSummaries(
  userId: string,
  opts: {
    conversationId?: string;
    /** Rows strictly after this (activity, id) in list order. */
    cursor?: ConversationCursor;
    limit?: number;
  } = {}
): Promise<ConversationSummaryRow[]> {
  const onlyOne = opts.conversationId
    ? Prisma.sql`AND c.id = ${opts.conversationId}`
    : Prisma.empty;
  // Row-value comparison matches ORDER BY activity DESC, id DESC exactly.
  // The stored timestamps are UTC wall time; ::timestamp keeps the cursor's
  // UTC value (Prisma sends Dates as ISO strings with Z).
  const afterCursor = opts.cursor
    ? Prisma.sql`AND (COALESCE(c.last_message_at, c.created_at), c.id COLLATE "C")
                     < (${opts.cursor.activity.toISOString()}::timestamp, ${opts.cursor.id} COLLATE "C")`
    : Prisma.empty;
  const limit = opts.limit ?? 50;

  return prisma.$queryRaw<ConversationSummaryRow[]>`
    SELECT
      c.id,
      COALESCE(c.last_message_at, c.created_at) AS activity,
      c.created_at,
      c.last_message_at,
      other.id                AS other_id,
      other.name              AS other_name,
      other.avatar_url        AS other_avatar_url,
      other_sp.handle         AS other_handle,
      me.last_read_message_id AS my_last_read,
      om.last_read_message_id AS other_last_read,
      (COALESCE(my_sp.read_receipts, true) AND COALESCE(other_sp.read_receipts, true))
                              AS receipts_visible,
      COALESCE(b.status = 'ACCEPTED', false) AS are_buddies,
      EXISTS (SELECT 1 FROM user_blocks ub
              WHERE ub.blocker_id = ${userId} AND ub.blocked_id = other.id) AS blocked_by_me,
      EXISTS (SELECT 1 FROM user_blocks ub
              WHERE ub.blocker_id = other.id AND ub.blocked_id = ${userId}) AS blocked_me,
      lm.id                   AS last_id,
      lm.sender_id            AS last_sender_id,
      left(lm.body, 160)      AS last_body,
      lm.created_at           AS last_created_at,
      (SELECT count(*)::int FROM (
         SELECT 1 FROM messages um
         WHERE um.conversation_id = c.id
           AND um.sender_id <> ${userId}
           AND um.id > me.last_read_message_id
         LIMIT ${UNREAD_CAP}
       ) capped)              AS unread
    FROM conversation_members me
    JOIN conversations c         ON c.id = me.conversation_id
    JOIN conversation_members om ON om.conversation_id = c.id AND om.user_id <> me.user_id
    JOIN users other             ON other.id = om.user_id
    LEFT JOIN social_profiles other_sp ON other_sp.user_id = other.id
    LEFT JOIN social_profiles my_sp    ON my_sp.user_id = me.user_id
    LEFT JOIN buddyships b
           ON b.user_low_id = c.user_low_id AND b.user_high_id = c.user_high_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.sender_id, m.body, m.created_at
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON true
    WHERE me.user_id = ${userId}
    ${onlyOne}
    ${afterCursor}
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id COLLATE "C" DESC
    LIMIT ${limit}
  `;
}

/** Total unread across all my conversations, capped (for the nav badge). */
export async function countUnreadTotal(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT 1
      FROM conversation_members me
      JOIN messages m
        ON m.conversation_id = me.conversation_id
       AND m.sender_id <> me.user_id
       AND m.id > me.last_read_message_id
      WHERE me.user_id = ${userId}
      LIMIT ${UNREAD_CAP}
    ) capped
  `;
  return rows[0]?.n ?? 0;
}

/**
 * A message `userId` can see — i.e. in a conversation they belong to.
 * Used to snapshot evidence for a report. Null otherwise.
 */
export async function findMessageVisibleTo(messageId: bigint, userId: string) {
  return prisma.message.findFirst({
    where: {
      id: messageId,
      conversation: { OR: [{ userLowId: userId }, { userHighId: userId }] },
    },
    select: { id: true, senderId: true, body: true },
  });
}

// ─── Live-chat tickets ───────────────────────────────────────

/**
 * Record a WebSocket ticket (its jti hash) unless the user already got
 * `limit` since `since` — counted and inserted under the actor lock.
 * Returns false when over the limit.
 */
export async function insertWsTicketWithinQuota(
  userId: string,
  ticket: { jtiHash: string; expiresAt: Date },
  quota: { limit: number; since: Date }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockActor(tx, userId);
    const recent = await tx.chatWsTicket.count({
      where: { userId, createdAt: { gte: quota.since } },
    });
    if (recent >= quota.limit) return false;
    await tx.chatWsTicket.create({
      data: { jtiHash: ticket.jtiHash, userId, expiresAt: ticket.expiresAt },
    });
    return true;
  });
}

/** Both members share read receipts (each one's setting is reciprocal). */
export async function bothShareReadReceipts(a: string, b: string): Promise<boolean> {
  const profiles = await prisma.socialProfile.findMany({
    where: { userId: { in: [a, b] } },
    select: { readReceipts: true },
  });
  return profiles.length === 2 && profiles.every((p) => p.readReceipts);
}

/** Retention: tickets past expiry (consumed or not) are useless. */
export async function deleteExpiredWsTickets(cutoff: Date): Promise<number> {
  const result = await prisma.chatWsTicket.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return result.count;
}

// ─── Retention ───────────────────────────────────────────────

/**
 * On-disk size of the chat tables (rows + indexes + TOAST) and of the whole
 * database. Deleted rows free space for reuse; the file does not shrink
 * right away, so this is what the 500 MB free-plan budget actually sees.
 */
export async function chatStorageBytes(): Promise<{ chat: number; database: number }> {
  const rows = await prisma.$queryRaw<{ chat: bigint; database: bigint }[]>`
    SELECT
      (SELECT COALESCE(sum(pg_total_relation_size(c.oid)), 0)
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname IN ('messages', 'conversations', 'conversation_members',
                            'buddyships', 'user_blocks', 'user_reports',
                            'social_profiles', 'buddy_request_events', 'chat_ws_tickets')
      )::bigint AS chat,
      pg_database_size(current_database())::bigint AS database
  `;
  return { chat: Number(rows[0]?.chat ?? 0), database: Number(rows[0]?.database ?? 0) };
}

/** Delete up to `batchSize` messages older than `cutoff`; returns how many. */
export async function deleteMessagesBefore(cutoff: Date, batchSize: number): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM messages
    WHERE id IN (
      SELECT id FROM messages
      WHERE created_at < ${cutoff}
      ORDER BY id
      LIMIT ${batchSize}
    )
  `;
}
