"use client";

/**
 * Chat home (/chat) — my conversations, newest first.
 *
 * Not opted in yet → the handle setup card. No chats yet → a nudge to the
 * Buddies page. Each row: avatar, name, last message preview, time, unread.
 */

import Link from "next/link";
import { MessageCircle, Users } from "lucide-react";
import { useSocialProfile } from "@/lib/hooks/use-social";
import { useConversations, type ConversationSummary } from "@/lib/hooks/use-chat";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { BuddyAvatar, displayName } from "@/components/chat/avatar";
import { HandleSetup } from "@/components/chat/handle-setup";
import { cn } from "@/lib/utils/cn";

export function formatChatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ConversationRow({ c, myId }: { c: ConversationSummary; myId: string }) {
  const preview = c.lastMessage
    ? `${c.lastMessage.senderId === myId ? "You: " : ""}${c.lastMessage.body}`
    : "Say hi 👋";

  return (
    <Link
      href={`/chat/${c.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors"
    >
      <BuddyAvatar
        name={c.otherUser.name}
        handle={c.otherUser.handle}
        avatarUrl={c.otherUser.avatarUrl}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-text-primary">
            {displayName(c.otherUser)}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs",
              c.unreadCount > 0 ? "text-primary font-medium" : "text-text-muted"
            )}
          >
            {formatChatTime(c.lastMessage?.createdAt ?? c.lastActivityAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm",
              c.unreadCount > 0 ? "text-text-primary" : "text-text-secondary"
            )}
          >
            {preview}
          </p>
          {c.unreadCount > 0 && (
            <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-background text-[11px] font-bold leading-5 text-center">
              {c.unreadCount >= 100 ? "99+" : c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ChatHome() {
  const { userId } = useOutbox();
  const profile = useSocialProfile();
  const optedIn = !!profile.data;
  const conversations = useConversations(optedIn);
  // A chat can move between pages while polling; keep the first copy.
  const seen = new Set<string>();
  const list = (conversations.data?.pages.flatMap((p) => p.conversations) ?? []).filter(
    (c) => (seen.has(c.id) ? false : (seen.add(c.id), true))
  );

  return (
    <div className="space-y-4 lg:space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
            Chat
          </h1>
          {profile.data && (
            <p className="text-text-secondary text-sm mt-0.5">@{profile.data.handle}</p>
          )}
        </div>
        {optedIn && (
          <Link
            href="/buddies"
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            <Users size={16} />
            Buddies
          </Link>
        )}
      </div>

      {profile.data === undefined ? (
        // Unknown yet: loading, failed, or paused offline with nothing cached.
        profile.isError || profile.fetchStatus === "paused" ? (
          <p className="text-sm text-text-muted">Couldn’t load chat. Check your connection.</p>
        ) : (
          <div className="bg-surface rounded-2xl border border-border h-40 animate-pulse" />
        )
      ) : !optedIn ? (
        <HandleSetup />
      ) : !conversations.data && !conversations.isError ? (
        conversations.fetchStatus === "paused" ? (
          <p className="text-sm text-text-muted">You’re offline. Your chats will load when you reconnect.</p>
        ) : (
          <div className="bg-surface rounded-2xl border border-border h-64 animate-pulse" />
        )
      ) : conversations.isError && !conversations.data ? (
        <div className="flex items-center justify-between gap-3 bg-surface rounded-2xl border border-border p-4">
          <p className="text-sm text-text-muted">Couldn’t load your chats.</p>
          <button
            type="button"
            onClick={() => conversations.refetch()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : list.length > 0 ? (
        <div className="space-y-3">
          <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {list.map((c) => (
              <ConversationRow key={c.id} c={c} myId={userId} />
            ))}
          </div>
          {conversations.hasNextPage && (
            <button
              type="button"
              onClick={() => conversations.fetchNextPage()}
              disabled={conversations.isFetchingNextPage}
              className="w-full rounded-xl border border-border py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              {conversations.isFetchingNextPage ? "Loading…" : "Show older chats"}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center space-y-3">
          <MessageCircle size={32} className="mx-auto text-text-muted" />
          <p className="text-sm text-text-secondary">
            No chats yet. Add a buddy, then message them from your buddy list.
          </p>
          <Link
            href="/buddies"
            className="inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background hover:bg-primary-hover"
          >
            Find buddies
          </Link>
        </div>
      )}
    </div>
  );
}
