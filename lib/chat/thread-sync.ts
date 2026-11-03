/**
 * Thread state transitions — pure, so the sync rules are unit-testable
 * ══════════════════════════════════════════════════════════════════════
 *
 * THE SYNC CURSOR: catch-up asks for "everything after X". X must be the
 * newest id that came from a CONTIGUOUS fetch of this conversation — the
 * first page, or an after-page. It must NOT be advanced by:
 *   • my own send's response — if others' messages 101–102 committed but
 *     weren't fetched yet, and my send confirms as 103, "after 103" would
 *     skip 101–102 forever (Codex review, 2026-10-09);
 *   • older pages (they're below the cursor anyway).
 * A message seen out of band (my sends) is merged for display only; the
 * next catch-up still starts from the cursor and fetches it again,
 * harmlessly de-duplicated.
 */

import { compareIds, mergeMessages, type ChatMessage, type ServerMessage } from "@/lib/chat/merge-messages";

export interface ThreadState {
  messages: ChatMessage[];
  hasOlder: boolean;
  /** Newest id fetched contiguously ("0" = nothing yet). */
  syncCursor: string;
}

export const EMPTY_THREAD: ThreadState = { messages: [], hasOlder: false, syncCursor: "0" };

function maxId(a: string, page: ServerMessage[]): string {
  let best = a;
  for (const m of page) if (compareIds(m.id, best) > 0) best = m.id;
  return best;
}

/**
 * The newest page. It sets the cursor ONLY on the first load: a later
 * refetch (e.g. after an invalidation) can return 121–150 while 101–120 are
 * still unfetched — taking 150 as the cursor would skip them forever. On a
 * refetch the cursor stays put and the next catch-up fills the gap.
 * `hasOlder` is likewise only taken from the first load (a refetch's
 * hasMore describes the gap, not the history).
 */
export function applyNewestPage(
  state: ThreadState,
  page: { messages: ServerMessage[]; hasMore: boolean }
): ThreadState {
  const firstLoad = state.syncCursor === "0" && !state.messages.some((m) => m.status === "sent");
  return {
    messages: mergeMessages(state.messages, page.messages),
    hasOlder: firstLoad ? page.hasMore : state.hasOlder,
    syncCursor: firstLoad ? maxId(state.syncCursor, page.messages) : state.syncCursor,
  };
}

/** A catch-up page fetched with after=state.syncCursor. */
export function applyAfterPage(state: ThreadState, page: ServerMessage[]): ThreadState {
  return {
    ...state,
    messages: mergeMessages(state.messages, page),
    syncCursor: maxId(state.syncCursor, page),
  };
}

/** An older page (scrolling up) — never moves the cursor. */
export function applyOlderPage(
  state: ThreadState,
  page: { messages: ServerMessage[]; hasMore: boolean }
): ThreadState {
  return { ...state, messages: mergeMessages(state.messages, page.messages), hasOlder: page.hasMore };
}

/** My send was confirmed — display it, but don't move the cursor. */
export function applySent(state: ThreadState, message: ServerMessage): ThreadState {
  return { ...state, messages: mergeMessages(state.messages, [message]) };
}
