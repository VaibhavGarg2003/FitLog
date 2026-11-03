"use client";

/**
 * Chat thread (/chat/[id]) — one conversation.
 *
 * TICKS on my messages: 🕓 sending · ✓ saved (sent) · ✓✓ read — "read" only
 * appears when BOTH people share read receipts (the server hides the other
 * person's marker otherwise).
 *
 * SCROLLING: opens at the bottom; new messages scroll into view only when
 * you're already near the bottom (or you sent one); "Load earlier messages"
 * keeps your place.
 */

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Flag,
  MoreVertical,
  Send,
} from "lucide-react";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { useConversation, useMarkRead, useSeenTracker, useThread } from "@/lib/hooks/use-chat";
import { useBlock, useRemoveBuddy, useUnblock } from "@/lib/hooks/use-social";
import { ChatApiError } from "@/lib/hooks/chat-api";
import { compareIds, type ChatMessage } from "@/lib/chat/merge-messages";
import { BuddyAvatar, displayName } from "@/components/chat/avatar";
import { ReportDialog } from "@/components/chat/report-dialog";
import { useLiveChatStatus } from "@/lib/chat/live-status";
import { cn } from "@/lib/utils/cn";

const MAX_CHARS = 2000;
const NEAR_BOTTOM_PX = 120;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Ticks({ message, otherLastRead }: { message: ChatMessage; otherLastRead: string | null }) {
  if (message.status !== "sent") {
    return message.status === "sending" ? <Clock size={12} aria-label="Sending" /> : null;
  }
  const read = otherLastRead !== null && compareIds(message.id, otherLastRead) <= 0;
  return read ? (
    <CheckCheck size={14} className="text-accent" aria-label="Read" />
  ) : (
    <Check size={14} aria-label="Sent" />
  );
}

export function ThreadView({ conversationId }: { conversationId: string }) {
  const { userId } = useOutbox();
  const liveStatus = useLiveChatStatus();
  const conversation = useConversation(conversationId);
  const thread = useThread(conversationId);

  const removeBuddy = useRemoveBuddy();
  const block = useBlock();
  const unblock = useUnblock();

  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<{ messageId?: string; preview?: string } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  // Read receipts only for messages actually seen on screen.
  const { seenUpTo, observe } = useSeenTracker(scroller);
  useMarkRead(conversationId, seenUpTo, conversation.data?.myLastReadMessageId);
  const nearBottom = useRef(true);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const lastCount = useRef(0);

  const c = conversation.data;
  const other = c?.otherUser;

  // Keep position when older messages are prepended; otherwise follow the
  // bottom if the user was already there or just sent something.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const messages = thread.messages;
    if (olderAnchor.current) {
      const { height, top } = olderAnchor.current;
      el.scrollTop = el.scrollHeight - height + top;
      olderAnchor.current = null;
    } else if (messages.length > lastCount.current) {
      const newest = messages[messages.length - 1];
      if (nearBottom.current || newest?.senderId === userId || lastCount.current === 0) {
        el.scrollTop = el.scrollHeight;
      }
    }
    lastCount.current = messages.length;
  }, [thread.messages, userId]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const notFound =
    (conversation.error instanceof ChatApiError && conversation.error.status === 404) ||
    (thread.error instanceof ChatApiError && thread.error.status === 404);

  if (notFound) {
    return (
      <div className="max-w-3xl space-y-3">
        <p className="text-sm text-text-secondary">This chat doesn’t exist or isn’t yours.</p>
        <Link href="/chat" className="text-sm text-primary hover:underline">
          Back to chats
        </Link>
      </div>
    );
  }

  async function loadOlder() {
    const el = scroller.current;
    if (el) olderAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    setLoadingOlder(true);
    try {
      await thread.loadOlder();
    } catch {
      olderAnchor.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }

  function submit() {
    const text = draft.trim();
    if (!text || text.length > MAX_CHARS || !c?.canMessage) return;
    thread.send(text);
    setDraft("");
  }

  const label = other ? displayName(other) : "Chat";

  return (
    <div
      className={cn(
        "mx-auto flex max-w-3xl flex-col",
        // Viewport minus top nav (3.5rem), main's top padding (1rem) and
        // bottom padding (6rem under the phone nav, 2rem on desktop).
        "h-[calc(100dvh-10.5rem)] lg:h-[calc(100dvh-6.5rem)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Link href="/chat" aria-label="Back to chats" className="text-text-secondary hover:text-text-primary">
          <ArrowLeft size={20} />
        </Link>
        {other ? (
          <>
            <BuddyAvatar name={other.name} handle={other.handle} avatarUrl={other.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{label}</p>
              {liveStatus === "offline" ? (
                <p className="truncate text-xs text-warning">
                  Live updates paused — still checking every 30 s
                </p>
              ) : (
                other.handle && <p className="truncate text-xs text-text-muted">@{other.handle}</p>
              )}
            </div>
          </>
        ) : (
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface" />
        )}
        {other && (
          <div className="relative">
            <button
              type="button"
              aria-label="Chat options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="rounded-lg p-1.5 text-text-secondary hover:bg-surface hover:text-text-primary"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
              >
                {c?.canMessage && (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    onClick={() => {
                      if (window.confirm(`Remove ${label} as a buddy? You won't be able to message each other.`)) {
                        removeBuddy.mutate(other.userId);
                      }
                    }}
                  >
                    Remove buddy
                  </button>
                )}
                {c?.blockedByMe ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    onClick={() => unblock.mutate(other.userId)}
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                    onClick={() => {
                      if (window.confirm(`Block ${label}? They won't be able to message you or send requests. They won't be told.`)) {
                        block.mutate(other.userId);
                      }
                    }}
                  >
                    Block
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
                  onClick={() => setReport({})}
                >
                  Report
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
        className="flex-1 overflow-y-auto py-3 space-y-1"
        aria-live="polite"
      >
        {thread.isLoading ? (
          <div className="space-y-2 px-1">
            {[40, 64, 52].map((w) => (
              <div key={w} className="h-9 animate-pulse rounded-2xl bg-surface" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <>
            {thread.hasOlder && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}
            {!thread.hasOlder && (
              <p className="pb-2 text-center text-[11px] text-text-muted">
                Messages are kept for 90 days.
              </p>
            )}
            {thread.messages.length === 0 && (
              <p className="pt-8 text-center text-sm text-text-muted">
                No messages yet. Say hi 👋
              </p>
            )}
            {thread.messages.map((m, i) => {
              const mine = m.senderId === userId;
              const prev = thread.messages[i - 1];
              const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const key = m.id ?? `local-${m.clientMessageId}`;
              return (
                <div key={key}>
                  {showDay && (
                    <p className="py-2 text-center text-[11px] font-medium uppercase tracking-wider text-text-muted">
                      {dayLabel(m.createdAt)}
                    </p>
                  )}
                  <div
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                    data-message-id={!mine && m.id ? m.id : undefined}
                    ref={!mine && m.id ? observe : undefined}
                  >
                    <div className="max-w-[80%] sm:max-w-[70%]">
                      <button
                        type="button"
                        onClick={() => !mine && m.id && setSelected(selected === m.id ? null : m.id)}
                        className={cn(
                          "w-full rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap break-words",
                          mine
                            ? "bg-primary-muted text-text-primary rounded-br-md"
                            : "bg-surface-elevated text-text-primary rounded-bl-md",
                          m.status === "failed" && "opacity-70",
                          mine && "cursor-default"
                        )}
                      >
                        {m.body}
                        <span className="ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[10px] text-text-muted">
                          {m.status === "sent" ? timeLabel(m.createdAt) : null}
                          {mine && <Ticks message={m} otherLastRead={c?.otherLastReadMessageId ?? null} />}
                        </span>
                      </button>
                      {m.status === "failed" && (
                        <div className="mt-1 flex items-center justify-end gap-2 text-xs text-danger">
                          <AlertCircle size={12} />
                          <span>{m.error ?? "Not sent"}</span>
                          <button
                            type="button"
                            onClick={() => thread.retry(m.clientMessageId)}
                            className="font-medium underline"
                          >
                            Retry
                          </button>
                          <button
                            type="button"
                            onClick={() => thread.discard(m.clientMessageId)}
                            className="text-text-muted underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {!mine && m.id && selected === m.id && other && (
                        <button
                          type="button"
                          onClick={() => setReport({ messageId: m.id ?? undefined, preview: m.body })}
                          className="mt-1 flex items-center gap-1 text-xs text-text-muted hover:text-danger"
                        >
                          <Flag size={12} /> Report message
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Composer */}
      {c && !c.canMessage ? (
        <p className="border-t border-border pt-3 text-center text-sm text-text-muted">
          {c.blockedByMe
            ? "You blocked this person. Unblock them to chat again."
            : "You can't message this person right now. You need to be buddies to chat."}
        </p>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends on devices with a keyboard; Shift+Enter = new line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={MAX_CHARS}
              placeholder="Message"
              aria-label="Message"
              disabled={!c}
              className="max-h-32 min-h-[2.75rem] w-full resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              style={{ height: `${Math.min(8, Math.max(1, draft.split("\n").length)) * 1.25 + 1.5}rem` }}
            />
            {draft.length > MAX_CHARS - 200 && (
              <p className="px-2 text-right text-[11px] text-text-muted">
                {draft.length}/{MAX_CHARS}
              </p>
            )}
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || !c}
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-background hover:bg-primary-hover disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </form>
      )}

      {report && other && (
        <ReportDialog
          userId={other.userId}
          userLabel={label}
          messageId={report.messageId}
          messagePreview={report.preview}
          onClose={() => {
            setReport(null);
            setSelected(null);
          }}
        />
      )}

    </div>
  );
}
