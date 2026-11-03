"use client";

/**
 * Unread badge for the Chat nav item. Renders nothing at zero, "99+" at the cap.
 */

import { useUnreadCount } from "@/lib/hooks/use-chat";
import { cn } from "@/lib/utils/cn";

export function UnreadBadge({ className }: { className?: string }) {
  const { data: unread } = useUnreadCount();
  if (!unread) return null;

  return (
    <span
      className={cn(
        "min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-primary text-background",
        "text-[10px] font-bold leading-[1.125rem] text-center",
        className
      )}
      aria-label={`${unread >= 100 ? "99+" : unread} unread messages`}
    >
      {unread >= 100 ? "99+" : unread}
    </span>
  );
}
