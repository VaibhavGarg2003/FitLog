/**
 * In-tab bus for live chat hints
 * ══════════════════════════════
 *
 * The live connection (components/chat/live-provider.tsx) publishes; open
 * threads subscribe and run their catch-up. Hints carry only ids — the data
 * always comes from the authenticated HTTP API.
 *
 *   message.new  — a message in `conversationId` committed
 *   resync       — something may have been missed (fresh connect / reconnect):
 *                  every open thread should catch up
 */

export type LiveHint =
  | { type: "message.new"; conversationId: string; messageId: string }
  | { type: "resync" };

type Listener = (hint: LiveHint) => void;

const listeners = new Set<Listener>();

export function onLiveHint(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLiveHint(hint: LiveHint): void {
  for (const listener of listeners) {
    try {
      listener(hint);
    } catch (error) {
      console.warn("[chat-live] hint listener failed", error);
    }
  }
}
