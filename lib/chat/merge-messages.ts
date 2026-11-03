/**
 * Client-side message list merging
 * ════════════════════════════════
 *
 * A thread on screen is assembled from several sources that overlap: the
 * first page, older pages (scroll up), catch-up pages (poll / reconnect /
 * live hint), and my own optimistic sends. mergeMessages folds them into one
 * list that is:
 *   • de-duplicated by server id,
 *   • sorted by server id (BigInt — ids are decimal strings),
 *   • free of a pending bubble once its confirmed copy arrives (matched by
 *     clientMessageId), with still-pending sends kept at the end in the order
 *     they were typed.
 */

export interface ServerMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
}

export type ChatMessage =
  | (ServerMessage & { status: "sent" })
  | (Omit<ServerMessage, "id"> & {
      id: null;
      status: "sending" | "failed";
      /** Why a failed send failed (shown under the bubble). */
      error?: string;
    });

export function compareIds(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function mergeMessages(
  current: ChatMessage[],
  incoming: ServerMessage[]
): ChatMessage[] {
  const confirmed = new Map<string, ChatMessage & { status: "sent" }>();
  const pending: ChatMessage[] = [];

  for (const m of current) {
    if (m.status === "sent") confirmed.set(m.id, m);
    else pending.push(m);
  }
  for (const m of incoming) {
    confirmed.set(m.id, { ...m, status: "sent" });
  }

  const confirmedClientIds = new Set(
    [...confirmed.values()].map((m) => `${m.senderId}:${m.clientMessageId}`)
  );

  const sorted = [...confirmed.values()].sort((a, b) => compareIds(a.id, b.id));
  const stillPending = pending.filter(
    (m) => !confirmedClientIds.has(`${m.senderId}:${m.clientMessageId}`)
  );
  return [...sorted, ...stillPending];
}

/** Newest confirmed id, or null when nothing is confirmed yet. */
export function newestConfirmedId(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.status === "sent") return m.id;
  }
  return null;
}

/** Oldest confirmed id, or null. */
export function oldestConfirmedId(messages: ChatMessage[]): string | null {
  const m = messages.find((x) => x.status === "sent");
  return m && m.status === "sent" ? m.id : null;
}

/** Newest confirmed message sent by someone other than `userId`. */
export function newestIncomingId(messages: ChatMessage[], userId: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.status === "sent" && m.senderId !== userId) return m.id;
  }
  return null;
}
