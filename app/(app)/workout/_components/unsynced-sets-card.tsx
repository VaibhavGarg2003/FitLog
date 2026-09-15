"use client";

/**
 * Unsynced Sets Card — sets saved on this phone that the server refused
 * ═════════════════════════════════════════════════════════════════════
 *
 * Two ways a queued set can fail for good:
 *
 *   gone     (404) — its workout no longer accepts sets: finished or removed,
 *                    often on another device, or cleaned up while the phone
 *                    was offline for a long time. The sets themselves are
 *                    fine, so the user can SAVE THEM AS A NEW WORKOUT on the
 *                    same date, or discard them.
 *   rejected (4xx) — the server will never accept these values. Discard only.
 *
 * Failed sets block "Finish Workout" and every later set of the same workout,
 * so they are never silently dropped: the user decides.
 */

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { SignInRequiredError, useOutbox } from "@/lib/offline/outbox-provider";
import type { OutboxRecord } from "@/lib/offline/outbox-types";

interface UnsyncedSetsCardProps {
  /** Adopt the recovered workout as the active session. */
  onRecovered: (sessionId: string, date: string) => void;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function UnsyncedSetsCard({ onRecovered }: UnsyncedSetsCardProps) {
  const { records, recoverSession, discardSession } = useOutbox();
  const [busySession, setBusySession] = useState<string | null>(null);
  const [error, setError] = useState<"sign-in" | "generic" | null>(null);

  // Group every record of a session that has at least one failure: the
  // failure blocks the whole session, so they are resolved together.
  const failedSessions = new Set(
    records.filter((r) => r.status === "failed").map((r) => r.sessionId)
  );
  if (failedSessions.size === 0) return null;

  const groups = [...failedSessions].map((sessionId) => {
    const sets = records.filter((r) => r.sessionId === sessionId);
    return {
      sessionId,
      date: sets[0].date,
      sets,
      recoverable: sets.some((r) => r.failure?.kind === "gone"),
    };
  });

  async function run(sessionId: string, action: () => Promise<void>) {
    setBusySession(sessionId);
    setError(null);
    try {
      await action();
    } catch (caught) {
      // A 401 means this tab's account isn't the one signed in — retrying
      // won't help, signing in will.
      setError(caught instanceof SignInRequiredError ? "sign-in" : "generic");
    } finally {
      setBusySession(null);
    }
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div
          key={group.sessionId}
          className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 space-y-2"
        >
          <p className="flex items-start gap-2 text-sm text-text-primary">
            <TriangleAlert size={16} className="text-red-400 mt-0.5 shrink-0" aria-hidden />
            <span>
              {group.sets.length} set{group.sets.length === 1 ? "" : "s"} from
              your workout on {formatDate(group.date)} couldn&apos;t be saved.{" "}
              {group.recoverable
                ? "That workout was finished or removed — possibly on another device."
                : "The server didn't accept them."}
            </span>
          </p>
          <SetSummary sets={group.sets} />
          <div className="flex flex-wrap items-center gap-3">
            {group.recoverable && (
              <button
                type="button"
                disabled={busySession !== null}
                onClick={() =>
                  run(group.sessionId, async () => {
                    const newId = await recoverSession(group.sessionId, group.date);
                    // null: nothing left to recover (another tab already did).
                    if (newId) onRecovered(newId, group.date);
                  })
                }
                className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {busySession === group.sessionId ? "Saving…" : "Save as a new workout"}
              </button>
            )}
            <button
              type="button"
              disabled={busySession !== null}
              onClick={() =>
                run(group.sessionId, () => discardSession(group.sessionId))
              }
              className="text-sm text-text-muted hover:text-red-300 disabled:opacity-50"
            >
              Discard {group.sets.length === 1 ? "it" : "them"}
            </button>
          </div>
        </div>
      ))}
      {error === "sign-in" && (
        <p className="text-sm text-red-400">
          This tab is out of date — you&apos;ve been signed out, or a different
          account is signed in.{" "}
          {/* A reload, not a /login link: the proxy bounces a signed-in user
              away from /login, so a link can't switch accounts. Reloading
              either shows the login page or the account that's really signed
              in; these sets stay on this phone for their owner. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline font-semibold"
          >
            Reload
          </button>{" "}
          to continue. Sign back in as the owner to save them.
        </p>
      )}
      {error === "generic" && (
        <p className="text-sm text-red-400">
          That didn&apos;t work — check your connection and try again.
        </p>
      )}
    </div>
  );
}

function SetSummary({ sets }: { sets: OutboxRecord[] }) {
  const byExercise = new Map<string, { name: string; count: number }>();
  for (const r of sets) {
    const entry = byExercise.get(r.exercise.id) ?? { name: r.exercise.name, count: 0 };
    entry.count++;
    byExercise.set(r.exercise.id, entry);
  }
  return (
    <p className="text-xs text-text-muted pl-6">
      {[...byExercise.values()]
        .map((e) => `${e.name} × ${e.count}`)
        .join(" · ")}
    </p>
  );
}
