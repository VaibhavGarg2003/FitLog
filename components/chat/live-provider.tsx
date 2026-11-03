"use client";

/**
 * LiveChatProvider — one live-chat WebSocket per tab
 * ═══════════════════════════════════════════════════
 *
 * Mounted in the app shell. Opens a socket only for users who opted into
 * buddies (have a handle) and only when the server hands out tickets
 * (live delivery configured). Everything here is an optimisation: with the
 * socket down, chat still works by polling (lib/hooks/use-chat.ts).
 *
 * LIFECYCLE
 *   ticket (POST /api/chat/ws-ticket, memory only) → open → send auth frame
 *   → "ready" within 10 s → live. Ping every 25 s; two missed pongs ⇒ dead.
 *   Server ends the lease after ~10 min (close 4001) → reconnect at once
 *   with a fresh ticket. Other closes → exponential backoff with jitter.
 *   On every "ready" we resync: open threads and lists catch up over HTTP,
 *   covering anything missed while disconnected.
 *
 * BACKGROUND TABS / MOBILE
 *   While hidden or offline we don't retry and don't count failures (a phone
 *   in a pocket is not an outage). Coming back visible/online reconnects
 *   immediately with a reset backoff. A socket that is already open is kept
 *   while hidden so hints still arrive.
 *
 * Status: "off" (not opted in / not configured) · "connecting" · "live" ·
 * "offline" (retrying). Hooks read it to slow their polling while live.
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { ChatApiError, chatFetch } from "@/lib/hooks/chat-api";
import { useSocialProfile, socialKeys } from "@/lib/hooks/use-social";
import { chatKeys } from "@/lib/hooks/use-chat";
import { emitLiveHint } from "@/lib/chat/live-events";
import { LiveStatusContext, type LiveStatus } from "@/lib/chat/live-status";
import {
  CLOSE_LEASE_OVER,
  CLOSE_TICKET_REFUSED,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  READY_TIMEOUT_MS,
  backoffDelay,
  parseServerFrame,
} from "@/lib/chat/live-protocol";


/** A ticket request that hangs longer than this is abandoned (then backoff). */
const TICKET_TIMEOUT_MS = 10_000;

/** After a 503 (live delivery not configured) wait this long before asking again. */
const UNAVAILABLE_RETRY_MS = 10 * 60 * 1000;

const canTry = () =>
  document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine !== false);

export function LiveChatProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  const profile = useSocialProfile();
  const optedIn = !!profile.data;
  const [status, setStatus] = useState<LiveStatus>("off");

  // Latest queryClient/userId for socket callbacks without re-running the effect.
  const ctx = useRef({ queryClient, userId });
  useEffect(() => {
    ctx.current = { queryClient, userId };
  }, [queryClient, userId]);

  useEffect(() => {
    if (!optedIn) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let lastPong = 0;
    let connecting = false;

    const clearTimers = () => {
      clearTimeout(retryTimer);
      clearTimeout(readyTimer);
      clearInterval(pingTimer);
    };

    const invalidateLists = () => {
      const { queryClient: qc, userId: uid } = ctx.current;
      qc.invalidateQueries({ queryKey: chatKeys.conversations(uid) });
      qc.invalidateQueries({ queryKey: chatKeys.unread(uid) });
    };

    const schedule = (delay: number) => {
      clearTimeout(retryTimer);
      if (disposed) return;
      retryTimer = setTimeout(() => void connect(), delay);
    };

    const failed = () => {
      if (disposed) return;
      setStatus("offline");
      if (!canTry()) return; // resumed by the visibility/online listeners
      schedule(backoffDelay(attempt++));
    };

    async function connect() {
      if (disposed || connecting || socket) return;
      if (!canTry()) {
        setStatus("offline");
        return;
      }
      connecting = true;
      setStatus((s) => (s === "live" ? s : "connecting"));

      let ticket: { ticket: string; url: string; userId: string };
      try {
        const raw = await chatFetch<Partial<typeof ticket> | null>(
          ctx.current.userId,
          "/api/chat/ws-ticket",
          { method: "POST", signal: AbortSignal.timeout(TICKET_TIMEOUT_MS) }
        );
        if (
          !raw ||
          typeof raw.ticket !== "string" ||
          typeof raw.url !== "string" ||
          typeof raw.userId !== "string"
        ) {
          throw new ChatApiError("Malformed ticket response", 0);
        }
        ticket = { ticket: raw.ticket, url: raw.url, userId: raw.userId };
      } catch (error) {
        connecting = false;
        if (disposed) return;
        if (error instanceof ChatApiError && error.status === 503) {
          setStatus("off"); // not configured: stay on polling, ask again much later
          schedule(UNAVAILABLE_RETRY_MS);
          return;
        }
        failed();
        return;
      }
      if (disposed || ticket.userId !== ctx.current.userId) {
        connecting = false;
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(ticket.url);
      } catch {
        connecting = false;
        failed();
        return;
      }
      socket = ws;
      connecting = false;
      // One deadline for the whole handshake: TCP/TLS connect, auth, "ready".
      // A socket stuck in CONNECTING closes too (→ onclose → backoff).
      readyTimer = setTimeout(() => ws.close(4000, "handshake timeout"), READY_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      };

      ws.onmessage = (e) => {
        const frame = parseServerFrame(e.data);
        if (!frame) return;
        if (frame.type === "ready") {
          clearTimeout(readyTimer);
          attempt = 0;
          lastPong = Date.now();
          setStatus("live");
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (Date.now() - lastPong > PONG_TIMEOUT_MS) {
              ws.close(4000, "pong timeout");
              return;
            }
            if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
          }, PING_INTERVAL_MS);
          // Anything sent while we were away: catch up over HTTP.
          emitLiveHint({ type: "resync" });
          invalidateLists();
          return;
        }
        if (frame.type === "pong") {
          lastPong = Date.now();
          return;
        }
        const event = frame.event;
        const { queryClient: qc, userId: uid } = ctx.current;
        if (event.type === "message.new") {
          emitLiveHint(event);
          invalidateLists();
        } else if (event.type === "conversation.read") {
          qc.invalidateQueries({ queryKey: chatKeys.conversation(uid, event.conversationId) });
          qc.invalidateQueries({ queryKey: chatKeys.conversations(uid) });
        } else if (event.type === "buddies.changed") {
          qc.invalidateQueries({ queryKey: socialKeys.all(uid) });
          qc.invalidateQueries({ queryKey: chatKeys.all(uid) });
        }
      };

      ws.onclose = (e) => {
        clearTimeout(readyTimer);
        clearInterval(pingTimer);
        if (socket === ws) socket = null;
        if (disposed) return;
        if (e.code === CLOSE_LEASE_OVER) {
          // Planned renewal: not a failure.
          setStatus("connecting");
          schedule(Math.round(Math.random() * 1500));
          return;
        }
        if (e.code === CLOSE_TICKET_REFUSED && attempt === 0) attempt = 1;
        failed();
      };

      ws.onerror = () => {
        // onclose follows and decides what to do.
      };
    }

    const resume = () => {
      if (disposed || !canTry() || socket || connecting) return;
      attempt = 0;
      clearTimeout(retryTimer);
      void connect();
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    void connect();

    return () => {
      disposed = true;
      clearTimers();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      if (socket) {
        socket.onclose = null;
        socket.close(1000, "bye");
        socket = null;
      }
      setStatus("off");
    };
  }, [optedIn, userId]);

  return (
    <LiveStatusContext.Provider value={optedIn ? status : "off"}>{children}</LiveStatusContext.Provider>
  );
}
