/**
 * Live-chat (WebSocket) server configuration — SERVER ONLY
 * ═════════════════════════════════════════════════════════
 *
 * Live delivery is an optional layer: chat works without it (clients poll).
 * It switches on only when ALL of these are set:
 *
 *   CHAT_WS_URL            wss://<django>/ws/inbox/  (handed to the browser)
 *   CHAT_WS_TICKET_SECRET  ≥32 chars, shared with Django — signs admission tickets
 *   CHAT_RELAY_URL         https://<django>/internal/chat/events
 *   CHAT_RELAY_SECRET      ≥32 chars, shared with Django — signs relay calls
 *                          (a DIFFERENT secret: a leaked ticket key must not
 *                          let anyone push events, and vice versa)
 *
 * Optional: CHAT_WS_TICKET_KID (key id, for rotation; default "1"),
 *           CHAT_WS_AUDIENCE (default "fitlog-chat-ws").
 *
 * Never NEXT_PUBLIC_*: the secrets must not reach the browser bundle, and
 * the URL is handed out by the ticket route only to signed-in users.
 */

export interface LiveConfig {
  wsUrl: string;
  ticketSecret: string;
  ticketKid: string;
  audience: string;
  relayUrl: string;
  relaySecret: string;
}

export const TICKET_ISSUER = "fitlog-web";
export const TICKET_TTL_SECONDS = 60;

const MIN_SECRET_LENGTH = 32;

export function getLiveConfig(): LiveConfig | null {
  const wsUrl = process.env.CHAT_WS_URL?.trim();
  const ticketSecret = process.env.CHAT_WS_TICKET_SECRET?.trim();
  const relayUrl = process.env.CHAT_RELAY_URL?.trim();
  const relaySecret = process.env.CHAT_RELAY_SECRET?.trim();
  if (!wsUrl || !ticketSecret || !relayUrl || !relaySecret) return null;
  if (ticketSecret.length < MIN_SECRET_LENGTH || relaySecret.length < MIN_SECRET_LENGTH) {
    console.warn("[chat-live] secrets shorter than 32 characters — live delivery disabled");
    return null;
  }
  if (ticketSecret === relaySecret) {
    console.warn("[chat-live] ticket and relay secrets must differ — live delivery disabled");
    return null;
  }
  return {
    wsUrl,
    ticketSecret,
    ticketKid: process.env.CHAT_WS_TICKET_KID?.trim() || "1",
    audience: process.env.CHAT_WS_AUDIENCE?.trim() || "fitlog-chat-ws",
    relayUrl,
    relaySecret,
  };
}
