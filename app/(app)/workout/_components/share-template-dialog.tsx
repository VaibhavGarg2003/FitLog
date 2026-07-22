"use client";

/**
 * Share Template Dialog
 * ═════════════════════
 *
 * Creates a share link for a template and presents it for distribution —
 * Copy link + Share on WhatsApp (the primary channel). Creating the link
 * is the snapshot moment (server-side); this dialog just surfaces the slug.
 */

import { useEffect, useState } from "react";
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

  // Create the link once when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    createShare
      .mutateAsync({ templateId: template.id, title: template.name })
      .then((res) => {
        if (!cancelled) setUrl(shareUrl(res.slug));
      })
      .catch(() => {
        /* error surfaced via createShare.isError */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {createShare.isError ? (
          <p className="text-sm text-red-400">
            {createShare.error instanceof Error
              ? createShare.error.message
              : "Couldn't create a share link."}
          </p>
        ) : !url ? (
          <p className="text-sm text-text-muted">Creating your link…</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
