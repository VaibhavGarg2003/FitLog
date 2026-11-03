/**
 * Live-chat WebSocket protocol (browser ⇄ Django) — shared constants + parsing
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Client → server (text frames, JSON, ≤ 4 KB):
 *   { "type": "auth", "ticket": "<jwt>" }   first frame, within 5 s of open
 *   { "type": "ping" }                      every 25 s while open
 *
 * Server → client:
 *   { "type": "ready", "leaseSeconds": 600 } authenticated, joined my inbox
 *   { "type": "pong" }
 *   { "type": "event", "event": { ... } }   an IDs-only hint (chat-relay.ts)
 *
 * Close codes the client acts on:
 *   4001 lease over (planned) → reconnect now with a fresh ticket, no backoff
 *   4401 ticket refused       → fresh ticket, then normal backoff
 *   4408 auth timeout · 4429 too many connections / frames → backoff
 *   1000/1001 normal / server going away (deploy) → backoff with jitter
 */

export const PING_INTERVAL_MS = 25_000;
/** Two missed pongs ⇒ the connection is dead even if the browser hasn't noticed. */
export const PONG_TIMEOUT_MS = 2 * PING_INTERVAL_MS + 5_000;
export const READY_TIMEOUT_MS = 10_000;
export const MAX_BACKOFF_MS = 30_000;

export const CLOSE_LEASE_OVER = 4001;
export const CLOSE_TICKET_REFUSED = 4401;

export type ServerFrame =
  | { type: "ready"; leaseSeconds: number }
  | { type: "pong" }
  | {
      type: "event";
      event:
        | { type: "message.new"; conversationId: string; messageId: string }
        | { type: "conversation.read"; conversationId: string }
        | { type: "buddies.changed" };
    };

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 100;

/** Parse a server frame; null for anything unexpected (ignored, never trusted). */
export function parseServerFrame(raw: unknown): ServerFrame | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const frame = data as Record<string, unknown>;

  if (frame.type === "ready") {
    const lease = Number(frame.leaseSeconds);
    return { type: "ready", leaseSeconds: Number.isFinite(lease) ? lease : 600 };
  }
  if (frame.type === "pong") return { type: "pong" };
  if (frame.type === "event" && frame.event && typeof frame.event === "object") {
    const e = frame.event as Record<string, unknown>;
    if (e.type === "message.new" && isString(e.conversationId) && isString(e.messageId) && /^\d+$/.test(e.messageId)) {
      return { type: "event", event: { type: "message.new", conversationId: e.conversationId, messageId: e.messageId } };
    }
    if (e.type === "conversation.read" && isString(e.conversationId)) {
      return { type: "event", event: { type: "conversation.read", conversationId: e.conversationId } };
    }
    if (e.type === "buddies.changed") {
      return { type: "event", event: { type: "buddies.changed" } };
    }
  }
  return null;
}

/** Exponential backoff with full jitter: random in [0, min(cap, 1s·2^attempt)]. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 10));
  return Math.round(500 + random() * ceiling);
}
