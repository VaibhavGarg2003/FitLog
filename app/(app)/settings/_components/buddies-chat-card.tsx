"use client";

/**
 * Buddies & Chat card (Settings)
 * ══════════════════════════════
 *
 * - Buddy name: change your @handle (or pick one — links to /buddies).
 * - Read receipts: reciprocal, like WhatsApp — turning yours off also hides
 *   other people's ✓✓ from you.
 * - Blocked people: unblock.
 */

import Link from "next/link";
import { useState } from "react";
import {
  useBuddies,
  useClaimHandle,
  useReadReceipts,
  useSocialProfile,
  useUnblock,
} from "@/lib/hooks/use-social";
import { displayName } from "@/components/chat/avatar";
import { cn } from "@/lib/utils/cn";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function BuddiesChatCard() {
  const profile = useSocialProfile();
  const optedIn = !!profile.data;
  const buddies = useBuddies(optedIn);
  const claim = useClaimHandle();
  const receipts = useReadReceipts();
  const unblock = useUnblock();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");

  const next = handle.trim().replace(/^@+/, "").toLowerCase();
  const blocked = buddies.data?.blocked ?? [];

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-4">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Buddies &amp; Chat
      </h2>

      {profile.isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-surface-elevated" />
      ) : !profile.data ? (
        <p className="text-sm text-text-secondary">
          Pick a buddy name to add friends and chat.{" "}
          <Link href="/buddies" className="text-primary hover:underline">
            Set up buddies
          </Link>
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-text-muted">Buddy name</p>
                <p className="text-sm font-medium text-text-primary">@{profile.data.handle}</p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => {
                    setHandle(profile.data!.handle);
                    setEditing(true);
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Change
                </button>
              )}
            </div>
            {editing && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!HANDLE_RE.test(next)) return;
                  claim.mutate(next, { onSuccess: () => setEditing(false) });
                }}
              >
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  aria-label="New buddy name"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={21}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!HANDLE_RE.test(next) || claim.isPending}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-xl border border-border px-3 py-2 text-xs text-text-secondary"
                >
                  Cancel
                </button>
              </form>
            )}
            {claim.error && editing && <p className="text-xs text-danger">{claim.error.message}</p>}
          </div>

          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-text-primary">Read receipts</span>
              <span className="block text-xs text-text-muted">
                Show buddies when you’ve read their messages. If you turn this off, you won’t see
                theirs either.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={profile.data.readReceipts}
              disabled={receipts.isPending}
              onClick={() => receipts.mutate(!profile.data!.readReceipts)}
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                profile.data.readReceipts ? "bg-primary" : "bg-surface-elevated border border-border"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                  profile.data.readReceipts ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
          </label>

          <div className="space-y-2">
            <p className="text-xs text-text-muted">Blocked people</p>
            {blocked.length === 0 ? (
              <p className="text-sm text-text-secondary">Nobody blocked.</p>
            ) : (
              <div className="divide-y divide-border">
                {blocked.map((b) => (
                  <div key={b.userId} className="flex items-center justify-between gap-3 py-2">
                    <p className="truncate text-sm text-text-primary">{displayName(b)}</p>
                    <button
                      type="button"
                      onClick={() => unblock.mutate(b.userId)}
                      disabled={unblock.isPending}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
