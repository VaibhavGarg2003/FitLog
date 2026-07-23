"use client";

/**
 * Share Template Dialog
 * ═════════════════════
 *
 * Creates a share link for a template and presents it for distribution —
 * Copy link + Share on WhatsApp (the primary channel).
 *
 * Creation is an EXPLICIT action (a button click), never a side-effect of
 * the dialog opening. Creating-on-open meant React StrictMode's double-
 * invoked effect minted TWO links per open, and opening-then-closing left
 * an orphan link the user never used. A link is a real, revocable resource;
 * it should be born from an intent, not a render.
 */

import { useState } from "react";
import { useCreateShare, shareUrl } from "@/lib/hooks/use-share";
import type { WorkoutTemplate } from "@/lib/hooks/use-templates";

export function ShareTemplateDialog({
  template,
  onClose,
}: {
  template: WorkoutTemplate;
  onClose: () => void;
}) {
  const createShare = useCreateShare();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    // One dialog → at most one link. Guard against a double-click and
    // against re-creating once we already hold a URL.
    if (url || createShare.isPending) return;
    try {
      const res = await createShare.mutateAsync({
        templateId: template.id,
        title: template.name,
      });
      setUrl(shareUrl(res.slug));
    } catch {
      /* surfaced via createShare.isError below */
    }
  }

  const waText = encodeURIComponent(
    `Check out my "${template.name}" workout on FitLog: ${url ?? ""}`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-elevated rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 border border-border space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-text-primary">Share “{template.name}”</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {url ? (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              Anyone with this link can view the plan (no login needed) and copy
              it to their own account. It expires in 90 days — manage or revoke
              it under Settings → Shared links.
            </p>

            <div className="flex items-center gap-2 bg-background border border-border rounded-xl p-2">
              <input
                readOnly
                value={url}
                className="flex-1 bg-transparent text-sm text-text-primary outline-none min-w-0"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 py-1.5 bg-primary/10 text-primary text-sm font-semibold rounded-lg hover:bg-primary/20 transition-colors shrink-0"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Share on WhatsApp
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              Create a public link anyone can open (no login needed) to view this
              plan and copy it to their own account. It expires in 90 days — you
              can revoke it any time under Settings → Shared links.
            </p>

            {createShare.isError && (
              <p className="text-sm text-red-400">
                {createShare.error instanceof Error
                  ? createShare.error.message
                  : "Couldn't create a share link."}
              </p>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={createShare.isPending}
              className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {createShare.isPending
                ? "Creating…"
                : createShare.isError
                  ? "Try again"
                  : "Create share link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
