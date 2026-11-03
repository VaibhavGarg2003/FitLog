/**
 * Chat Service — 1:1 conversations between buddies
 * ═════════════════════════════════════════════════
 *
 * RULES:
 *   • Only ACCEPTED buddies can start a conversation or send a message, and
 *     a block in either direction stops both. Checked under the pair lock in
 *     the same transaction as the insert, so a send can never slip past a
 *     block or unbuddy that commits first.
 *   • "Sent ✓" means "committed to Postgres" — the HTTP 201 response. Live
 *     delivery to the other person is a separate, best-effort hint.
 *   • Sends are idempotent on (sender, clientMessageId): a retry returns the
 *     original message with created: false. Reusing a client id for a
 *     DIFFERENT message is a 409.
 *   • 30 messages per minute and 1000 per day per sender, counted in
 *     Postgres under the actor lock.
 *
 * READ MARKERS always advance (they drive my own unread counts). The
 * read-receipt preference only decides whether the OTHER person may see
 * them — enforced in the conversation-list query.
 */

import {
  advanceReadMarker,
  bothShareReadReceipts,
  insertWsTicketWithinQuota,
  countMessagesSince,
  countUnreadTotal,
  findCommittedMessage,
  findConversationForUser,
  getOrCreateConversation,
  insertMessage,
  listConversationSummaries,
  listMessages,
  toWireMessage,
  type ConversationSummaryRow,
  type WireMessage,
} from "@/lib/repositories/chat.repository";
import {
  getBuddyRow,
  isBlockedEitherWay,
  isUniqueViolation,
  withPairTransaction,
} from "@/lib/repositories/social.repository";
import { requireSocialProfile } from "@/lib/services/social.service";
import { DAY_MS } from "@/lib/social/buddy-rules";
import { otherInPair } from "@/lib/social/pair";
import {
  encodeConversationCursor,
  type ConversationCursor,
} from "@/lib/chat/conversation-cursor";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  ValidationError,
} from "@/lib/utils/errors";
import { getLiveConfig } from "@/lib/chat/live-config";
import { hashJti, newJti, signTicket } from "@/lib/chat/ws-ticket";

export const SENDS_PER_MINUTE = 30;
export const SENDS_PER_DAY = 1000;
const SEND_MAX_ATTEMPTS = 2;

const CONVERSATION_NOT_FOUND = "Conversation not found";

// ─── Wire shapes ─────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  otherUser: {
    userId: string;
    handle: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
  lastMessage: { id: string; senderId: string; body: string; createdAt: string } | null;
  unreadCount: number;
  myLastReadMessageId: string;
  /** Null unless BOTH people share read receipts. */
  otherLastReadMessageId: string | null;
  canMessage: boolean;
  blockedByMe: boolean;
  lastActivityAt: string;
}

function toSummary(row: ConversationSummaryRow): ConversationSummary {
  return {
    id: row.id,
    otherUser: {
      userId: row.other_id,
      handle: row.other_handle,
      name: row.other_name,
      avatarUrl: row.other_avatar_url,
    },
    lastMessage:
      row.last_id !== null && row.last_sender_id && row.last_body !== null && row.last_created_at
        ? {
            id: row.last_id.toString(),
            senderId: row.last_sender_id,
            body: row.last_body,
            createdAt: row.last_created_at.toISOString(),
          }
        : null,
    unreadCount: row.unread,
    myLastReadMessageId: row.my_last_read.toString(),
    otherLastReadMessageId: row.receipts_visible ? row.other_last_read.toString() : null,
    canMessage: row.are_buddies && !row.blocked_by_me && !row.blocked_me,
    blockedByMe: row.blocked_by_me,
    lastActivityAt: (row.last_message_at ?? row.created_at).toISOString(),
  };
}

// ─── Conversations ───────────────────────────────────────────

export const CONVERSATION_PAGE_SIZE = 50;

/** One page of my chat list; `nextCursor` is null on the last page. */
export async function listConversations(
  userId: string,
  cursor?: ConversationCursor
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const rows = await listConversationSummaries(userId, {
    cursor,
    limit: CONVERSATION_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, CONVERSATION_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    conversations: page.map(toSummary),
    nextCursor:
      rows.length > CONVERSATION_PAGE_SIZE && last
        ? encodeConversationCursor({ activity: last.activity, id: last.id })
        : null,
  };
}

export async function getConversation(
  userId: string,
  conversationId: string
): Promise<ConversationSummary> {
  const rows = await listConversationSummaries(userId, { conversationId, limit: 1 });
  if (rows.length === 0) throw new NotFoundError(CONVERSATION_NOT_FOUND);
  return toSummary(rows[0]);
}

/** Open (or create) the conversation with a buddy. Returns its id. */
/**
 * Emergency brake: CHAT_WRITES_PAUSED=true stops new chats and messages
 * (e.g. the database is near the free plan's size limit) while reading,
 * buddies and the rest of FitLog keep working.
 */
function assertChatWritesOpen() {
  if (process.env.CHAT_WRITES_PAUSED === "true") {
    throw new ServiceUnavailableError("Chat is paused for maintenance. Please try again later.");
  }
}

export async function startConversation(userId: string, otherId: string): Promise<string> {
  assertChatWritesOpen();
  if (otherId === userId) throw new ValidationError("You can't message yourself.");
  await requireSocialProfile(userId);

  return withPairTransaction(userId, otherId, async (tx, pair) => {
    if (await isBlockedEitherWay(tx, userId, otherId)) {
      throw new NotFoundError("User not found.");
    }
    const row = await getBuddyRow(tx, pair);
    if (row?.status !== "ACCEPTED") {
      throw new ConflictError("You can only message your buddies.");
    }
    return getOrCreateConversation(tx, pair);
  });
}

// ─── Messages ────────────────────────────────────────────────

export interface SendResult {
  message: WireMessage;
  /** False when this was a retry of an already-committed message. */
  created: boolean;
  /** Who should be told about it (live-delivery hint). */
  recipientId: string;
}

function replayOrConflict(
  committed: { conversationId: string; body: string },
  conversationId: string,
  body: string
) {
  if (committed.conversationId !== conversationId || committed.body !== body) {
    throw new ConflictError("This message was already sent with different content.");
  }
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: { clientMessageId: string; body: string }
): Promise<SendResult> {
  assertChatWritesOpen();
  const conversation = await findConversationForUser(conversationId, userId);
  if (!conversation) throw new NotFoundError(CONVERSATION_NOT_FOUND);
  const recipientId = otherInPair(
    { low: conversation.userLowId, high: conversation.userHighId },
    userId
  );

  // A retry of a committed send is a fact regardless of what changed since
  // (block, unbuddy, quota) — answer it before any of those checks.
  const committed = await findCommittedMessage(userId, input.clientMessageId);
  if (committed) {
    replayOrConflict(committed, conversationId, input.body);
    return { message: toWireMessage(committed), created: false, recipientId };
  }

  for (let attempt = 0; attempt < SEND_MAX_ATTEMPTS; attempt++) {
    try {
      return await withPairTransaction(userId, recipientId, async (tx, pair) => {
        const raced = await findCommittedMessage(userId, input.clientMessageId, tx);
        if (raced) {
          replayOrConflict(raced, conversationId, input.body);
          return { message: toWireMessage(raced), created: false, recipientId };
        }

        if (await isBlockedEitherWay(tx, userId, recipientId)) {
          throw new ConflictError("You can't send messages to this person.");
        }
        const row = await getBuddyRow(tx, pair);
        if (row?.status !== "ACCEPTED") {
          throw new ConflictError("You're no longer buddies, so you can't send messages here.");
        }

        const now = Date.now();
        if ((await countMessagesSince(tx, userId, new Date(now - 60_000))) >= SENDS_PER_MINUTE) {
          throw new TooManyRequestsError("You're sending messages too fast. Wait a moment.");
        }
        if ((await countMessagesSince(tx, userId, new Date(now - DAY_MS))) >= SENDS_PER_DAY) {
          throw new TooManyRequestsError("You've reached today's message limit.");
        }

        const message = await insertMessage(tx, {
          conversationId,
          senderId: userId,
          clientMessageId: input.clientMessageId,
          body: input.body,
        });
        return { message: toWireMessage(message), created: true, recipientId };
      });
    } catch (error) {
      // Two identical sends raced past the in-transaction check; the loser's
      // unique violation aborted its transaction. Retry in a fresh one —
      // the replay check will now find the winner's row.
      if (isUniqueViolation(error) && attempt < SEND_MAX_ATTEMPTS - 1) continue;
      throw error;
    }
  }
  throw new Error("unreachable");
}

export async function getMessages(
  userId: string,
  conversationId: string,
  query: { before?: bigint; after?: bigint; limit: number }
): Promise<{ messages: WireMessage[]; hasMore: boolean }> {
  const conversation = await findConversationForUser(conversationId, userId);
  if (!conversation) throw new NotFoundError(CONVERSATION_NOT_FOUND);
  const page = await listMessages(conversationId, query);
  return { messages: page.messages.map(toWireMessage), hasMore: page.hasMore };
}

export interface ReadResult {
  lastReadMessageId: string;
  advanced: boolean;
  /** The other member. */
  otherUserId: string;
  /** Tell the other member live — only when the marker moved AND both share receipts. */
  notifyOther: boolean;
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
  lastReadMessageId: bigint
): Promise<ReadResult> {
  const conversation = await findConversationForUser(conversationId, userId);
  if (!conversation) throw new NotFoundError(CONVERSATION_NOT_FOUND);
  const result = await advanceReadMarker(conversationId, userId, lastReadMessageId);
  const otherUserId = otherInPair(
    { low: conversation.userLowId, high: conversation.userHighId },
    userId
  );
  return {
    lastReadMessageId: result.lastReadMessageId.toString(),
    advanced: result.advanced,
    otherUserId,
    notifyOther: result.advanced && (await bothShareReadReceipts(userId, otherUserId)),
  };
}

// ─── Live-chat admission ─────────────────────────────────────

export const WS_TICKETS_PER_MINUTE = 20;

/**
 * A 60-second, single-use ticket that opens ONE WebSocket to the live-chat
 * server for this user. 503 when live delivery isn't configured — the client
 * then simply keeps polling.
 */
export async function issueWsTicket(
  userId: string
): Promise<{ ticket: string; url: string; expiresAt: number }> {
  const config = getLiveConfig();
  if (!config) throw new ServiceUnavailableError("Live chat isn't available right now.");
  await requireSocialProfile(userId);

  const jti = newJti();
  const iat = Math.floor(Date.now() / 1000);
  const { ticket, expiresAt } = signTicket(
    { sub: userId, jti, aud: config.audience, iat },
    { secret: config.ticketSecret, kid: config.ticketKid }
  );
  const stored = await insertWsTicketWithinQuota(
    userId,
    { jtiHash: hashJti(jti), expiresAt: new Date(expiresAt * 1000) },
    { limit: WS_TICKETS_PER_MINUTE, since: new Date(Date.now() - 60_000) }
  );
  if (!stored) throw new TooManyRequestsError("Reconnecting too often. Wait a moment.");
  return { ticket, url: config.wsUrl, expiresAt };
}

export async function getUnreadTotal(userId: string): Promise<number> {
  return countUnreadTotal(userId);
}
