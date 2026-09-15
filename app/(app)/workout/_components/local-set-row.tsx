"use client";

/**
 * Local Set Row — a set saved on this phone, not yet on the server
 * ════════════════════════════════════════════════════════════════
 *
 * Read-only on purpose. The set's request may already have reached the server
 * (a lost response looks exactly like no signal), so its payload must not
 * change until the server confirms it — editing it could produce a set that
 * differs from the one already saved. Once synced, it becomes a normal
 * <SetRow> with the usual edit/delete.
 *
 * A set the server refused can be discarded here. A set whose workout is gone
 * is recovered for the whole session by <UnsyncedSetsCard>.
 */

import { useState } from "react";
import { CloudUpload, TriangleAlert } from "lucide-react";
import { useOutbox } from "@/lib/offline/outbox-provider";
import type { DisplaySet } from "@/lib/offline/merge-sets";
import { SetRow } from "./set-row";

type LocalSet = Extract<DisplaySet, { kind: "local" }>;

export function LocalSetRow({ set }: { set: LocalSet }) {
  const { discard } = useOutbox();
  const [busy, setBusy] = useState(false);
  const failed = set.syncState === "failed";

  return (
    <div className="flex items-center gap-2 pl-7 pr-1">
      <span className="text-xs text-text-muted w-10 shrink-0">
        Set {set.setNumber}
      </span>
      <span className="text-xs text-text-secondary flex-1 truncate">
        {`${set.weight}kg × ${set.reps}`}
        {set.rpe != null ? ` · Intensity ${set.rpe}` : ""}
        {set.isWarmup ? " · warm-up" : ""}
      </span>
      {failed ? (
        <>
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-red-400">
            <TriangleAlert size={12} aria-hidden />
            Not saved
          </span>
          {set.failure?.kind === "rejected" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await discard(set.clientRequestId);
                setBusy(false);
              }}
              className="shrink-0 text-[11px] text-text-muted hover:text-red-300 disabled:opacity-50"
            >
              Discard
            </button>
          )}
        </>
      ) : (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-text-muted"
          title="Saved on this phone — will sync automatically"
        >
          <CloudUpload size={12} aria-hidden />
          Syncing
        </span>
      )}
    </div>
  );
}

/** Renders a merged set with the right row: editable if on the server, read-only if local. */
export function DisplaySetRow({
  set,
  sessionId,
  date,
  exerciseName,
}: {
  set: DisplaySet;
  sessionId: string;
  date: string;
  exerciseName: string;
}) {
  if (set.kind === "local") return <LocalSetRow set={set} />;
  return (
    <SetRow set={set} sessionId={sessionId} date={date} exerciseName={exerciseName} />
  );
}
