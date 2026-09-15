"use client";

/**
 * Offline / sync status banner (inside the signed-in app shell)
 * ═════════════════════════════════════════════════════════════
 *
 * A full-page offline screen only helps when a page can't load. Most of the
 * time the page is already open and requests start failing silently — this
 * bar explains that state, and tells the user their sets are safe.
 *
 * Priority (one message at a time, most actionable first):
 *   1. sets waiting but the server says this tab isn't signed in as their owner → reload
 *   2. sets the server refused → review them on the Workout page
 *   3. offline → sets are saved on this phone
 *   4. online with sets still waiting → syncing
 */

import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { usePwa } from "./pwa-provider";
import { useOutbox } from "@/lib/offline/outbox-provider";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function OfflineBanner() {
  const { isOnline } = usePwa();
  const { records, needsLogin } = useOutbox();

  const failed = records.filter((r) => r.status === "failed").length;
  const waiting = records.length - failed;

  let tone: "warn" | "info" = "info";
  let icon = <CloudOff size={16} aria-hidden />;
  let message: React.ReactNode = null;

  if (needsLogin && waiting > 0) {
    tone = "warn";
    icon = <TriangleAlert size={16} aria-hidden />;
    message = (
      <>
        {plural(waiting, "set")} saved on this phone can&apos;t sync — you&apos;ve
        been signed out, or another account is signed in.{" "}
        {/* Reload, not a /login link: the proxy bounces signed-in users away
            from /login. A reload shows login or the account really signed in. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="underline font-semibold"
        >
          Reload
        </button>
      </>
    );
  } else if (failed > 0) {
    tone = "warn";
    icon = <TriangleAlert size={16} aria-hidden />;
    message = (
      <>
        {plural(failed, "set")} couldn&apos;t be saved.{" "}
        <Link href="/workout" className="underline font-semibold">
          Review on Workout
        </Link>
      </>
    );
  } else if (!isOnline) {
    message =
      waiting > 0
        ? `You're offline — ${plural(waiting, "set")} saved on this phone. They'll sync when you're back online.`
        : "You're offline. Sets you log are saved on this phone; other changes need a connection.";
  } else if (waiting > 0) {
    icon = <RefreshCw size={16} aria-hidden className="animate-spin" />;
    message = `Syncing ${plural(waiting, "set")}…`;
  }

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        tone === "warn"
          ? "w-full flex items-center gap-2 px-4 py-2 text-sm bg-amber-500/10 text-amber-200 border-b border-amber-500/30"
          : "w-full flex items-center gap-2 px-4 py-2 text-sm bg-surface-elevated text-text-secondary border-b border-border"
      }
    >
      <span className="shrink-0">{icon}</span>
      <span>{message}</span>
    </div>
  );
}
