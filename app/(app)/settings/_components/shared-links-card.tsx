"use client";

/**
 * Shared Links Card (Settings)
 * ═════════════════════════════
 *
 * Manage the share links the user has created: see view counts + expiry,
 * copy again, or revoke. "A share is a door you must be able to close"
 * (doc 06). Renders nothing until there's at least one link.
 */

import { useState } from "react";
import {
  useMyShares,
  useRevokeShare,
  shareUrl,
  type MyShareLink,
} from "@/lib/hooks/use-share";

function statusLabel(link: MyShareLink): { text: string; muted: boolean } {
  if (link.revoked) return { text: "Revoked", muted: true };
  if (link.expiresAt && new Date(link.expiresAt) <= new Date())
    return { text: "Expired", muted: true };
  return { text: "Active", muted: false };
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Shared Links
      </h2>
      {children}
    </div>
  );
}

export function SharedLinksCard() {
  const { data: links, isLoading, isError, refetch, isFetching } = useMyShares();
  const revoke = useRevokeShare();
  const [copied, setCopied] = useState<string | null>(null);

  // A failed load (e.g. the share service is cold) must NOT silently hide the
  // card — the user would have no way to see or revoke their links. Show the
  // error with a retry instead.
  if (isError) {
    return (
      <CardShell>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">Couldn’t load your shared links.</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs text-primary font-medium hover:underline disabled:opacity-50 shrink-0"
          >
            {isFetching ? "Retrying…" : "Retry"}
          </button>
        </div>
      </CardShell>
    );
  }

  if (isLoading || !links || links.length === 0) return null;

  return (
    <CardShell>
      <div className="divide-y divide-border">
        {links.map((link) => {
          const status = statusLabel(link);
          const live = status.text === "Active";
          return (
            <div key={link.slug} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">
                  {link.title}
                </p>
                <p className="text-xs text-text-muted">
                  <span className={status.muted ? "text-text-muted" : "text-primary"}>
                    {status.text}
                  </span>{" "}
                  · {link.viewCount} view{link.viewCount === 1 ? "" : "s"}
                </p>
              </div>
              {live && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareUrl(link.slug));
                      setCopied(link.slug);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    {copied === link.slug ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke.mutate(link.slug)}
                    disabled={revoke.isPending}
                    className="text-xs text-text-muted hover:text-red-400 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
