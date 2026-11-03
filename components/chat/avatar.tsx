/**
 * Buddy avatar — profile photo, or the first letter of their name/handle.
 */

import Image from "next/image";
import { cn } from "@/lib/utils/cn";

export function BuddyAvatar({
  name,
  handle,
  avatarUrl,
  size = 40,
  className,
}: {
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  size?: number;
  className?: string;
}) {
  const label = name ?? handle ?? "?";
  const initial = label.trim()[0]?.toUpperCase() ?? "?";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border border-border bg-surface-elevated",
        "flex items-center justify-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span className="text-sm font-semibold text-text-primary" aria-hidden>
          {initial}
        </span>
      )}
    </div>
  );
}

/** "Rahul" + "@rahul_lifts" → display pieces. */
export function displayName(user: { name: string | null; handle: string | null }) {
  return user.name?.trim() || (user.handle ? `@${user.handle}` : "FitLog user");
}
