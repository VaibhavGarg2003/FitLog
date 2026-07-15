/**
 * User Menu — Avatar + Sign out popover
 * ═════════════════════════════════════
 *
 * Renders the signed-in user's Google profile photo (or a fallback)
 * on the top-right of the nav. Click opens a small menu with "Sign out".
 *
 * Sign-out goes through POST /api/auth/logout so httpOnly session
 * cookies are cleared on the server (never from the browser).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";
import { useProfile } from "@/lib/hooks/use-profile";
import { cn } from "@/lib/utils/cn";

export function UserMenu() {
  const { data: profile } = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const avatarUrl = profile?.user?.avatarUrl ?? null;
  const name = profile?.user?.name ?? null;
  const email = profile?.user?.email ?? null;
  const initial =
    (name?.trim()?.[0] ?? email?.trim()?.[0] ?? "?").toUpperCase();

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Still leave the app even if the request fails
    }
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center overflow-hidden",
          "rounded-full border border-border bg-surface-elevated",
          "cursor-pointer ring-offset-background transition-opacity",
          "hover:opacity-90 focus:outline-none focus-visible:ring-2",
          "focus-visible:ring-accent focus-visible:ring-offset-2"
        )}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name ? `${name}'s profile photo` : "Profile photo"}
            width={36}
            height={36}
            className="h-full w-full object-cover"
            // Google avatars are already sized; skip Next optimizer quirks
            unoptimized
          />
        ) : name || email ? (
          <span className="text-sm font-semibold text-text-primary">
            {initial}
          </span>
        ) : (
          <User size={18} className="text-text-secondary" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 min-w-[11rem]",
            "rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
          )}
        >
          {(name || email) && (
            <div className="border-b border-border px-3 py-2">
              {name && (
                <p className="truncate text-sm font-medium text-text-primary">
                  {name}
                </p>
              )}
              {email && (
                <p className="truncate text-xs text-text-muted">{email}</p>
              )}
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2.5",
              "cursor-pointer text-sm font-medium text-danger",
              "hover:bg-danger/10 transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <LogOut size={16} />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
