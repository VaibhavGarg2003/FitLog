/**
 * Merge server sets with queued (not yet confirmed) sets for display
 * ══════════════════════════════════════════════════════════════════
 *
 * The workout page used to derive everything — "Set N", totals, the checklist
 * — from server data alone. With the outbox, a set exists the moment it is
 * saved on the phone, so those views read this merged list instead.
 *
 * A local set is a DIFFERENT type (kind: "local") on purpose: it has no server
 * id, so it can never be handed to the edit/delete APIs by mistake.
 */

import type { OutboxFailure, OutboxRecord, OutboxStatus } from "./outbox-types";

export interface ServerSet {
  id: string;
  setNumber: number;
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  isWarmup: boolean;
  clientRequestId?: string | null;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    category: string;
    metValue: number;
    isCompound: boolean;
  };
}

export type DisplaySet =
  | ({ kind: "server" } & ServerSet)
  | {
      kind: "local";
      clientRequestId: string;
      /** Where it will most likely land; the server has the final say. */
      setNumber: number;
      weight: number;
      reps: number;
      rpe: number | null;
      isWarmup: boolean;
      exercise: ServerSet["exercise"];
      syncState: OutboxStatus;
      failure?: OutboxFailure;
    };

/** Stable key for React lists. */
export function displaySetKey(set: DisplaySet): string {
  return set.kind === "server" ? set.id : `local:${set.clientRequestId}`;
}

/**
 * Server sets in their existing order, followed by queued sets in the order
 * they were logged. A queued set the server already returns (same
 * clientRequestId) is shown once, as the server set.
 */
export function mergeSessionSets(
  serverSets: ServerSet[],
  records: OutboxRecord[]
): DisplaySet[] {
  const onServer = new Set(
    serverSets.map((s) => s.clientRequestId).filter((id): id is string => !!id)
  );
  const highest = new Map<string, number>();
  for (const s of serverSets) {
    highest.set(s.exercise.id, Math.max(highest.get(s.exercise.id) ?? 0, s.setNumber));
  }

  const merged: DisplaySet[] = serverSets.map((s) => ({ kind: "server", ...s }));

  const queued = records
    .filter((r) => !onServer.has(r.clientRequestId))
    .sort((a, b) => a.seq - b.seq);

  for (const r of queued) {
    const setNumber = (highest.get(r.exercise.id) ?? 0) + 1;
    highest.set(r.exercise.id, setNumber);
    merged.push({
      kind: "local",
      clientRequestId: r.clientRequestId,
      setNumber,
      weight: r.payload.weight,
      reps: r.payload.reps,
      rpe: r.payload.rpe ?? null,
      isWarmup: r.payload.isWarmup,
      exercise: r.exercise,
      syncState: r.status,
      failure: r.failure,
    });
  }

  return merged;
}

/** One past the highest set number this exercise has, server or queued. */
export function nextSetNumber(sets: DisplaySet[], exerciseId: string): number {
  return (
    sets
      .filter((s) => s.exercise.id === exerciseId)
      .reduce((max, s) => Math.max(max, s.setNumber), 0) + 1
  );
}
