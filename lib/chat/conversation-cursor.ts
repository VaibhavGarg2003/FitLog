/**
 * Conversation-list cursor
 * ════════════════════════
 *
 * The chat list is ordered newest activity first, ties broken by id:
 *   ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
 * A page's cursor is its LAST row's (activity, id); the next page is every
 * row strictly after it in that order. Encoded as "<epoch-ms>.<uuid>" —
 * timestamps are stored with millisecond precision, so nothing is lost.
 */

export interface ConversationCursor {
  activity: Date;
  id: string;
}

const CURSOR_RE = /^(\d{1,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function encodeConversationCursor(c: ConversationCursor): string {
  return `${c.activity.getTime()}.${c.id}`;
}

/** Null for anything malformed. */
export function decodeConversationCursor(raw: string): ConversationCursor | null {
  const match = CURSOR_RE.exec(raw);
  if (!match) return null;
  const activity = new Date(Number(match[1]));
  if (Number.isNaN(activity.getTime())) return null;
  return { activity, id: match[2] };
}
