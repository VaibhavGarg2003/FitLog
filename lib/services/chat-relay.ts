/**
 * Chat relay — the "doorbell" from Next.js to the Django WebSocket server
 * ════════════════════════════════════════════════════════════════════════
 *
 * After a chat/buddy change COMMITS, the route schedules ringChatDoorbell()
 * with next/server `after()`. It POSTs a small, IDs-only event batch to
 * Django, which pushes it down the recipients' open sockets. The browser then
 * fetches the real data through our normal authenticated API.
 *
 * BEST-EFFORT BY DESIGN: a lost ring costs at most one polling interval —
 * clients also catch up on focus, reconnect and a timer, and Postgres is the
 * only source of truth. So: one attempt, 2 s timeout, never throws, never
 * delays the user's response. Without live config it does nothing.
 *
 * SIGNATURE: HMAC-SHA256 over "<timestamp>\n<eventId>\n<body>" with
 * CHAT_RELAY_SECRET; Django rejects stale (>60 s) or mismatched requests.
 * Recipients always come from our own server-side state, never from the
 * browser's request.
 */

import { createHmac, randomUUID } from "node:crypto";
import { getLiveConfig } from "@/lib/chat/live-config";

export type ChatEvent =
  | { type: "message.new"; conversationId: string; messageId: string }
  | { type: "conversation.read"; conversationId: string }
  | { type: "buddies.changed" };

export interface ChatDelivery {
  recipients: string[];
  event: ChatEvent;
}

const RELAY_TIMEOUT_MS = 2000;

export function signRelayBody(
  secret: string,
  timestamp: string,
  eventId: string,
  body: string
): string {
  return createHmac("sha256", secret).update(`${timestamp}\n${eventId}\n${body}`).digest("hex");
}

export async function ringChatDoorbell(deliveries: ChatDelivery[]): Promise<void> {
  const config = getLiveConfig();
  const nonEmpty = deliveries.filter((d) => d.recipients.length > 0);
  if (!config || nonEmpty.length === 0) return;

  const eventId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ deliveries: nonEmpty });
  const signature = signRelayBody(config.relaySecret, timestamp, eventId, body);

  try {
    const res = await fetch(config.relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fitlog-timestamp": timestamp,
        "x-fitlog-event-id": eventId,
        "x-fitlog-signature": `v1=${signature}`,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[chat-relay] ${res.status} from relay (event ${eventId})`);
    }
  } catch (error) {
    // Asleep / restarting / unreachable Django: clients fall back to polling.
    console.warn(
      `[chat-relay] ring failed (event ${eventId}): ${error instanceof Error ? error.name : "error"}`
    );
  }
}
