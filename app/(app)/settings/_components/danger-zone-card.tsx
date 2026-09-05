"use client";

/**
 * Danger Zone Card (Settings)
 * ═══════════════════════════
 *
 * Permanent account deletion with a typed-confirmation dialog. Matches the
 * existing settings card pattern (goal-card, shared-links-card, etc.).
 *
 * When deletion is not provisioned (ACCOUNT_DELETION_DATABASE_URL unset /
 * function not installed), the control is hidden — never a normal destructive
 * button that always ends in 503.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";

export function DangerZoneCard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ deletionAvailable: boolean }>({
    queryKey: ["account", "deletion-available"],
    queryFn: async () => {
      const res = await fetch("/api/account");
      if (!res.ok) throw new Error("Failed to load account settings");
      return res.json();
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Unprovisioned → render nothing (do not show a button that always 503s).
  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border h-28 animate-pulse" />
    );
  }
  if (!data?.deletionAvailable) {
    return null;
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") {
      setError('Type DELETE in all caps to confirm.');
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (res.status === 503) {
        setError(
          "Account deletion is not available right now. Please contact support."
        );
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Delete failed");
      }
      queryClient.clear();
      router.push("/login");
      router.refresh();
    } catch {
      setError("Could not delete your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-red-500/30 space-y-3">
      <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
        Danger Zone
      </h2>
      <p className="text-sm text-text-secondary">
        Permanently delete your account and all associated data. This cannot be
        undone.
      </p>

      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => {
            setConfirmOpen(true);
            setConfirmText("");
            setError("");
          }}
          className={cn(
            "w-full py-2.5 px-4 rounded-xl text-sm font-semibold",
            "border border-red-500/40 text-red-400",
            "hover:bg-red-500/10 transition-colors"
          )}
        >
          Delete account
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-red-500/20 bg-background/60 p-3">
          <p className="text-xs text-text-muted">
            Type <span className="font-mono font-semibold text-red-400">DELETE</span>{" "}
            to confirm permanent deletion.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder="DELETE"
            className="w-full p-2.5 bg-background border border-border rounded-lg text-text-primary focus:border-red-400 focus:outline-none font-mono text-sm"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
                setError("");
              }}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-background disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy || confirmText !== "DELETE"}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-semibold",
                "bg-red-600 text-white hover:bg-red-500",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {busy ? "Deleting..." : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
