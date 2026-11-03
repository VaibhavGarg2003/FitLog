"use client";

/**
 * Handle setup — the opt-in to buddies + chat.
 *
 * Shown on /chat and /buddies until the user picks a @handle. Nobody can find
 * or message them before this, and they can't find anyone either.
 */

import { useState } from "react";
import { AtSign, Users } from "lucide-react";
import { useClaimHandle } from "@/lib/hooks/use-social";
import { cn } from "@/lib/utils/cn";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function HandleSetup({ compact = false }: { compact?: boolean }) {
  const claim = useClaimHandle();
  const [value, setValue] = useState("");
  const handle = value.trim().replace(/^@+/, "").toLowerCase();
  const valid = HANDLE_RE.test(handle);

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-4 max-w-lg">
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary-muted p-2.5">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Train with your buddies</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Pick a buddy name so friends can add you and chat with you. Only people you
              accept as buddies can message you.
            </p>
          </div>
        </div>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) claim.mutate(handle);
        }}
      >
        <label htmlFor="buddy-handle" className="text-xs font-medium text-text-secondary">
          Your buddy name
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <AtSign
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id="buddy-handle"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="rahul_lifts"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={21}
              className={cn(
                "w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5",
                "text-sm text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent"
              )}
            />
          </div>
          <button
            type="submit"
            disabled={!valid || claim.isPending}
            className={cn(
              "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-background",
              "hover:bg-primary-hover transition-colors disabled:opacity-50"
            )}
          >
            {claim.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-xs text-text-muted">
          3–20 characters: lowercase letters, numbers and _
        </p>
        {claim.error && <p className="text-xs text-danger">{claim.error.message}</p>}
      </form>
    </div>
  );
}
