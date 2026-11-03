"use client";

/**
 * Report dialog — report a user, optionally a specific message of theirs.
 * A copy of the message is kept with the report for 90 days.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { useReport, type ReportReason } from "@/lib/hooks/use-social";
import { cn } from "@/lib/utils/cn";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "SPAM", label: "Spam" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "OTHER", label: "Something else" },
];

export function ReportDialog({
  userId,
  userLabel,
  messageId,
  messagePreview,
  onClose,
}: {
  userId: string;
  userLabel: string;
  messageId?: string;
  messagePreview?: string;
  onClose: () => void;
}) {
  const report = useReport();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${userLabel}`}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Report {userLabel}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {report.isSuccess ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Thanks — we’ve received your report. You can also block this person so they can’t
              contact you.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-background"
            >
              Done
            </button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason) return;
              report.mutate({
                userId,
                messageId,
                reason,
                details: details.trim() || undefined,
              });
            }}
          >
            {messagePreview && (
              <p className="rounded-xl bg-background border border-border p-3 text-sm text-text-secondary line-clamp-3">
                “{messagePreview}”
              </p>
            )}
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-text-secondary mb-1">Why?</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer",
                    reason === r.value
                      ? "border-accent text-text-primary"
                      : "border-border text-text-secondary"
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[var(--color-accent)]"
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything else we should know? (optional)"
              className="w-full rounded-xl border border-border bg-background p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            {report.error && <p className="text-xs text-danger">{report.error.message}</p>}
            <button
              type="submit"
              disabled={!reason || report.isPending}
              className="w-full rounded-xl bg-danger py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {report.isPending ? "Sending…" : "Send report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
