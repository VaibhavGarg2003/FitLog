/**
 * Chat hooks — TanStack Query + manual thread state
 * ══════════════════════════════════════════════════
 *
 * useConversations()      my chat list (refreshes every 30 s while visible)
 * useUnreadCount()        nav badge (every 60 s while visible)
 * useConversation(id)     one chat's header: other person, receipts, canMessage
 * useStartConversation()  open / create a chat with a buddy
 * useThread(id)           the messages: newest page, older pages, catch-up,
 *                         optimistic send + retry, read markers
 *
 * HOW A THREAD STAYS CORRECT
 * ──────────────────────────
 * Postgres is the truth; this hook only ever MERGES pages from it
 * (lib/chat/merge-messages.ts). Catch-up asks for "everything after the
 * newest message I have" and repeats until hasMore is false. It runs on
 * mount, when the tab becomes visible again, when the device comes back
 * online, whenever a live hint names this conversation (or the socket
 * reconnects), and on a timer — every 30 s, or every 2 min while the live
 * socket is up. A missed hint therefore costs at most one polling interval,
 * never a lost message.
 *
 * SENDING: the bubble appears instantly ("sending"), keyed by a fresh
 * clientMessageId. The server makes retries idempotent, so "Retry" re-sends
 * with the SAME id and can never create a duplicate.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { onLiveHint } from "@/lib/chat/live-events";
import { useLiveChatStatus } from "@/lib/chat/live-status";
import { ChatApiError, chatFetch } from "@/lib/hooks/chat-api";
import {
  compareIds,
  oldestConfirmedId,
  type ChatMessage,
  type ServerMessage,
} from "@/lib/chat/merge-messages";
import {
  EMPTY_THREAD,
  applyAfterPage,
  applyNewestPage,
  applyOlderPage,
  applySent,
  type ThreadState,
} from "@/lib/chat/thread-sync";

export const POLL_INTERVAL_MS = 30_000;
/** While the live socket is up, polling is only a safety net for lost hints. */
export const LIVE_RECONCILE_MS = 120_000;

/** Poll every 30 s, or every 2 min while live hints are flowing. */
function usePollInterval(): number {
  return useLiveChatStatus() === "live" ? LIVE_RECONCILE_MS : POLL_INTERVAL_MS;
}
const READ_THROTTLE_MS = 5_000;
const READ_MAX_RETRIES = 3;
/** A message counts as seen once this much of it is inside the scroll area. */
const SEEN_RATIO = 0.6;
const CATCH_UP_MAX_PAGES = 10;

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
  otherLastReadMessageId: string | null;
  canMessage: boolean;
  blockedByMe: boolean;
  lastActivityAt: string;
}

interface MessagePage {
  messages: ServerMessage[];
  hasMore: boolean;
}


export const chatKeys = {
  all: (userId: string) => ["chat", userId] as const,
  conversations: (userId: string) => ["chat", userId, "conversations"] as const,
  conversation: (userId: string, id: string) => ["chat", userId, "conversation", id] as const,
  thread: (userId: string, id: string) => ["chat", userId, "thread", id] as const,
  unread: (userId: string) => ["chat", userId, "unread"] as const,
};

const isVisible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

// ─── Lists ───────────────────────────────────────────────────

interface ConversationPage {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

/** My chat list, 50 per page (fetchNextPage for older chats). */
export function useConversations(enabled = true) {
  const { userId } = useOutbox();
  const pollInterval = usePollInterval();
  return useInfiniteQuery({
    queryKey: chatKeys.conversations(userId),
    queryFn: ({ pageParam }) =>
      chatFetch<ConversationPage>(
        userId,
        pageParam
          ? `/api/chat/conversations?cursor=${encodeURIComponent(pageParam)}`
          : "/api/chat/conversations"
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 15_000,
    refetchInterval: pollInterval, // paused automatically while the tab is hidden
  });
}

export function useUnreadCount(enabled = true) {
  const { userId } = useOutbox();
  const live = useLiveChatStatus() === "live";
  return useQuery({
    queryKey: chatKeys.unread(userId),
    queryFn: async () =>
      (await chatFetch<{ unread: number }>(userId, "/api/chat/unread")).unread,
    enabled,
    staleTime: 30_000,
    refetchInterval: live ? 5 * 60_000 : 60_000,
    retry: false,
  });
}

export function useConversation(conversationId: string) {
  const { userId } = useOutbox();
  const pollInterval = usePollInterval();
  return useQuery({
    queryKey: chatKeys.conversation(userId, conversationId),
    queryFn: async () =>
      (
        await chatFetch<{ conversation: ConversationSummary }>(
          userId,
          `/api/chat/conversations/${encodeURIComponent(conversationId)}`
        )
      ).conversation,
    staleTime: 15_000,
    refetchInterval: pollInterval,
    retry: (count, error) => !(error instanceof ChatApiError && error.status === 404) && count < 1,
  });
}

export function useStartConversation() {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) =>
      (
        await chatFetch<{ id: string }>(userId, "/api/chat/conversations", {
          method: "POST",
          json: { userId: otherUserId },
        })
      ).id,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.conversations(userId) }),
  });
}

// ─── Thread ──────────────────────────────────────────────────

export function useThread(conversationId: string) {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  const key = useMemo(() => chatKeys.thread(userId, conversationId), [userId, conversationId]);
  const base = `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`;

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ThreadState> => {
      const page = await chatFetch<MessagePage>(userId, `${base}?limit=30`);
      const previous = queryClient.getQueryData<ThreadState>(key) ?? EMPTY_THREAD;
      let state = applyNewestPage(previous, page);
      // A REFETCH keeps the old cursor (see thread-sync.ts) — fill any gap
      // between it and the page we just got right away, not at the next poll.
      for (let i = 0; i < CATCH_UP_MAX_PAGES && state !== previous; i++) {
        if (state.syncCursor === "0" || page.messages.length === 0) break;
        const newestOnPage = page.messages[page.messages.length - 1].id;
        if (compareIds(state.syncCursor, newestOnPage) >= 0) break;
        const gap = await chatFetch<MessagePage>(
          userId,
          `${base}?after=${state.syncCursor}&limit=50`
        );
        state = applyAfterPage(state, gap.messages);
        if (!gap.hasMore) break;
      }
      return state;
    },
    // Freshness is driven by catch-up below, not by refetching page one.
    staleTime: Infinity,
    retry: (count, error) => !(error instanceof ChatApiError && error.status === 404) && count < 1,
  });

  const update = useCallback(
    (fn: (state: ThreadState) => ThreadState) =>
      queryClient.setQueryData<ThreadState>(key, (state) =>
        fn(state ?? EMPTY_THREAD)
      ),
    [queryClient, key]
  );

  // Catch-up — single-flight: a request while one runs schedules exactly one rerun.
  const catchingUp = useRef(false);
  const rerun = useRef(false);
  const catchUp = useCallback(async () => {
    if (catchingUp.current) {
      rerun.current = true;
      return;
    }
    catchingUp.current = true;
    try {
      do {
        rerun.current = false;
        const state = queryClient.getQueryData<ThreadState>(key);
        if (!state) {
          await queryClient.invalidateQueries({ queryKey: key });
          continue;
        }
        // Start from the SYNC cursor (contiguously fetched), never from my
        // own just-confirmed sends — see lib/chat/thread-sync.ts.
        let cursor = state.syncCursor;
        for (let i = 0; i < CATCH_UP_MAX_PAGES; i++) {
          const page = await chatFetch<MessagePage>(userId, `${base}?after=${cursor}&limit=50`);
          if (page.messages.length > 0) {
            update((s) => applyAfterPage(s, page.messages));
            cursor = page.messages[page.messages.length - 1].id;
          }
          if (!page.hasMore) break;
        }
      } while (rerun.current);
    } catch {
      // Offline / transient — the next tick, focus or reconnect retries.
    } finally {
      catchingUp.current = false;
    }
  }, [queryClient, key, userId, update, base]);

  // Poll while visible (slowly when live); catch up on focus / reconnect,
  // and immediately when a live hint names this conversation.
  const pollInterval = usePollInterval();
  useEffect(() => {
    const tick = () => {
      if (isVisible()) void catchUp();
    };
    const interval = setInterval(tick, pollInterval);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    const unsubscribe = onLiveHint((hint) => {
      if (hint.type === "resync" || hint.conversationId === conversationId) void catchUp();
    });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
      unsubscribe();
    };
  }, [catchUp, pollInterval, conversationId]);

  const loadingOlder = useRef(false);
  const loadOlder = useCallback(async () => {
    const state = queryClient.getQueryData<ThreadState>(key);
    const before = state ? oldestConfirmedId(state.messages) : null;
    if (!state?.hasOlder || before === null || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const page = await chatFetch<MessagePage>(userId, `${base}?before=${before}&limit=30`);
      update((s) => applyOlderPage(s, page));
    } finally {
      loadingOlder.current = false;
    }
  }, [queryClient, key, userId, update, base]);

  const deliver = useCallback(
    async (clientMessageId: string, body: string) => {
      try {
        const result = await chatFetch<{ message: ServerMessage }>(userId, base, {
          method: "POST",
          json: { clientMessageId, body },
        });
        update((s) => applySent(s, result.message));
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations(userId) });
      } catch (error) {
        const reason =
          error instanceof ChatApiError ? error.message : "Not sent. Tap to retry.";
        update((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.status !== "sent" && m.clientMessageId === clientMessageId
              ? { ...m, status: "failed" as const, error: reason }
              : m
          ),
        }));
        if (error instanceof ChatApiError && error.status === 409) {
          // No longer allowed (unbuddied / blocked): refresh the header.
          queryClient.invalidateQueries({ queryKey: chatKeys.conversation(userId, conversationId) });
        }
      }
    },
    [queryClient, userId, conversationId, update, base]
  );

  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body) return;
      const clientMessageId = crypto.randomUUID();
      const pending: ChatMessage = {
        id: null,
        status: "sending",
        conversationId,
        senderId: userId,
        clientMessageId,
        body,
        createdAt: new Date().toISOString(),
      };
      update((s) => ({ ...s, messages: [...s.messages, pending] }));
      void deliver(clientMessageId, body);
    },
    [conversationId, userId, update, deliver]
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const state = queryClient.getQueryData<ThreadState>(key);
      const message = state?.messages.find(
        (m) => m.status === "failed" && m.clientMessageId === clientMessageId
      );
      if (!message) return;
      update((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.status === "failed" && m.clientMessageId === clientMessageId
            ? { ...m, status: "sending" as const, error: undefined }
            : m
        ),
      }));
      void deliver(clientMessageId, message.body);
    },
    [queryClient, key, update, deliver]
  );

  const discard = useCallback(
    (clientMessageId: string) =>
      update((s) => ({
        ...s,
        messages: s.messages.filter(
          (m) => !(m.status === "failed" && m.clientMessageId === clientMessageId)
        ),
      })),
    [update]
  );

  return {
    messages: query.data?.messages ?? [],
    hasOlder: query.data?.hasOlder ?? false,
    isLoading: query.isLoading,
    error: query.error,
    loadOlder,
    catchUp,
    send,
    retry,
    discard,
  };
}

// ─── Read markers ────────────────────────────────────────────

/**
 * Tell the server I've read up to `seenUpTo` — the newest incoming message
 * that was actually ON SCREEN (useSeenTracker below), never one that merely
 * loaded below the viewport while I was reading older history. Only while
 * the page is visible, at most once every 5 s per conversation, and only
 * when the marker would actually move.
 */
export function useMarkRead(
  conversationId: string,
  seenUpTo: string | null,
  myLastReadMessageId: string | undefined
) {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  const lastSentAt = useRef(0);
  const sentUpTo = useRef<string | null>(null);

  useEffect(() => {
    const target = seenUpTo;
    if (!target || myLastReadMessageId === undefined) return;
    if (compareIds(target, myLastReadMessageId) <= 0) return;
    if (sentUpTo.current && compareIds(target, sentUpTo.current) <= 0) return;

    // The target stays pending until the server acknowledges it: a write
    // skipped while hidden/offline, or one that failed, is retried on
    // visibility/online and with a bounded backoff.
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const acknowledged = () =>
      sentUpTo.current !== null && compareIds(target, sentUpTo.current) <= 0;

    const fire = async () => {
      timer = undefined;
      if (cancelled || inFlight || acknowledged() || !isVisible()) return;
      inFlight = true;
      lastSentAt.current = Date.now();
      try {
        await chatFetch(userId, `/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
          method: "POST",
          json: { lastReadMessageId: target },
        });
        sentUpTo.current = target;
        queryClient.invalidateQueries({ queryKey: chatKeys.unread(userId) });
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations(userId) });
        queryClient.invalidateQueries({ queryKey: chatKeys.conversation(userId, conversationId) });
      } catch {
        failures += 1;
        if (!cancelled && failures <= READ_MAX_RETRIES) {
          schedule(READ_THROTTLE_MS * 2 ** failures);
        }
      } finally {
        inFlight = false;
      }
    };

    // Every attempt — first, retry or resume — goes through the throttle.
    const schedule = (minDelay = 0) => {
      if (cancelled || timer !== undefined || acknowledged()) return;
      const wait = Math.max(minDelay, READ_THROTTLE_MS - (Date.now() - lastSentAt.current));
      timer = setTimeout(fire, wait);
    };
    schedule(1000);
    const retryNow = () => {
      if (isVisible()) schedule();
    };
    document.addEventListener("visibilitychange", retryNow);
    window.addEventListener("online", retryNow);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", retryNow);
      window.removeEventListener("online", retryNow);
    };
  }, [seenUpTo, myLastReadMessageId, userId, conversationId, queryClient]);
}

/**
 * Which incoming messages has the user actually SEEN? Attach `observe` as
 * the ref of each incoming, confirmed bubble (with data-message-id). A
 * message counts once ≥60% of it is inside the scroll area while the tab is
 * visible. Returns the newest such id (only ever moves forward).
 */
export function useSeenTracker(scroller: React.RefObject<HTMLElement | null>) {
  const [seenUpTo, setSeenUpTo] = useState<string | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const pending = useRef(new Set<Element>());
  const intersecting = useRef(new Set<string>());

  const bump = useCallback((ids: Iterable<string>) => {
    let best: string | null = null;
    for (const id of ids) if (!best || compareIds(id, best) > 0) best = id;
    if (!best) return;
    const candidate = best;
    setSeenUpTo((current) => (current && compareIds(current, candidate) >= 0 ? current : candidate));
  }, []);

  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          // threshold only controls WHEN we're notified; the first report
          // can be any ratio, so check it.
          if (entry.isIntersecting && entry.intersectionRatio >= SEEN_RATIO) {
            intersecting.current.add(id);
          } else {
            intersecting.current.delete(id);
          }
        }
        if (isVisible()) bump(intersecting.current);
      },
      { root, threshold: [0, SEEN_RATIO, 1] }
    );
    observer.current = io;
    for (const el of pending.current) io.observe(el);

    // Coming back to the tab: what's on screen now counts as seen.
    const onVisible = () => {
      if (isVisible()) bump(intersecting.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      io.disconnect();
      observer.current = null;
    };
  }, [scroller, bump]);

  /** Ref callback for an incoming bubble. */
  const observe = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    pending.current.add(el);
    observer.current?.observe(el);
    return () => {
      pending.current.delete(el);
      observer.current?.unobserve(el);
      const id = el.dataset.messageId;
      if (id) intersecting.current.delete(id);
    };
  }, []);

  return { seenUpTo, observe };
}
