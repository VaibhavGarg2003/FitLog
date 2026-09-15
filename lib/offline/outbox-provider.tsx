"use client";

/**
 * Outbox Provider — keeps queued sets flowing to the server
 * ═════════════════════════════════════════════════════════
 *
 * Mounted once in app/(app)/layout.tsx with the signed-in user's id (from the
 * server layout — no extra request). It:
 *   • exposes this user's queued sets to the UI, live across tabs
 *   • enqueues new sets (resolving once they're durably saved on the phone)
 *   • drains the queue: on mount, on reconnect, when the app comes back to the
 *     foreground, after each enqueue or discard, when a backoff expires, and
 *     every 30s while anything is waiting (navigator.onLine can't be trusted)
 *   • recovers or discards sets the server refused
 *
 * Records of OTHER users on this device (a session that expired without an
 * explicit sign-out) are never listed or sent; they wait for their owner.
 *
 * LIFETIME: everything here belongs to ONE mounted provider for ONE user.
 * When it unmounts (sign-out, navigating to /login), `activeRef` turns false:
 * a drain in flight puts its current set back untouched instead of reading a
 * response that may have been answered under the next person's cookies, and
 * no timer is scheduled again.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { drainOutbox } from "./drain";
import { getOutboxStore } from "./outbox-store";
import type { EnqueueInput, OutboxRecord } from "./outbox-types";
import {
  sendSet,
  STALE_SENDING_MS,
  withDrainLock,
  withDrainLockWaiting,
} from "./transport";
import { EXPECTED_USER_HEADER } from "@/lib/utils/expected-user";

const POLL_MS = 30_000;
/** Minimum wait before re-checking when another tab holds the drain lock. */
const LOCK_BUSY_RETRY_MS = 5_000;

interface OutboxContextValue {
  userId: string;
  /** This user's queued sets, oldest first (a live mirror of IndexedDB). */
  records: OutboxRecord[];
  /**
   * Some set is parked because the server said "not signed in" (or signed in
   * as someone else). Derived from the stored records, so it stays true until
   * that set is sent or released — not cleared by an unrelated idle pass.
   */
  needsLogin: boolean;
  enqueueSet: (input: Omit<EnqueueInput, "userId">) => Promise<OutboxRecord>;
  /**
   * Authoritative check straight from IndexedDB. Use for decisions (Finish),
   * not `records`, which can lag a just-committed enqueue by a tick.
   */
  hasUnsynced: (sessionId: string) => Promise<boolean>;
  discard: (clientRequestId: string) => Promise<boolean>;
  /** Removes a session's queued sets. For server-confirmed discards, or the user's explicit choice. */
  discardSession: (sessionId: string) => Promise<void>;
  /**
   * Save a "gone" session's sets into a new workout. Returns the new session
   * id, or null if there was nothing left to recover (e.g. another tab did it).
   */
  recoverSession: (fromSessionId: string, date: string) => Promise<string | null>;
  /** Drop records the server already returned (by clientRequestId). */
  reconcile: (serverClientRequestIds: string[]) => void;
}

const OutboxContext = createContext<OutboxContextValue | null>(null);

/**
 * The server refused because this tab's user isn't the one signed in (signed
 * out, or another account signed in from another tab). Recoverable by signing
 * in again — not a connection problem.
 */
export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in again to save these sets");
    this.name = "SignInRequiredError";
  }
}

type SessionsCache = Array<{
  id: string;
  exerciseSets?: Array<{ clientRequestId?: string | null }>;
}>;

function isServerSetRow(
  row: unknown,
  clientRequestId: string
): row is { id: string; clientRequestId: string } {
  return (
    typeof row === "object" &&
    row !== null &&
    typeof (row as { id?: unknown }).id === "string" &&
    (row as { clientRequestId?: unknown }).clientRequestId === clientRequestId
  );
}

export function OutboxProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  const needsLogin = records.some((r) => r.authPaused);

  const activeRef = useRef(false);
  const recordsRef = useRef<OutboxRecord[]>([]);
  const drainingRef = useRef(false);
  const rerunRef = useRef(false);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRequestedRef = useRef(false);
  // Stable handle for timers and listeners; always points at the latest runDrain.
  const runDrainRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Put the confirmed set into the cached sessions list so the row stays on
   * screen when its record is deleted. The full refetch happens once per pass.
   */
  const onSynced = useCallback(
    async (record: OutboxRecord, row: unknown) => {
      if (!isServerSetRow(row, record.clientRequestId)) {
        throw new Error("Unexpected response for a synced set");
      }
      queryClient.setQueryData<SessionsCache>(
        ["workout", "sessions", record.date],
        (sessions) =>
          sessions?.map((session) => {
            if (session.id !== record.sessionId) return session;
            const sets = session.exerciseSets ?? [];
            if (sets.some((s) => s.clientRequestId === record.clientRequestId)) {
              return session;
            }
            return {
              ...session,
              // POST returns a narrower exercise; the snapshot has every field.
              exerciseSets: [...sets, { ...row, exercise: record.exercise }],
            };
          })
      );
    },
    [queryClient]
  );

  const scheduleWake = useCallback(
    async (minDelayMs: number) => {
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
      if (!activeRef.current) return;
      const wakeAt = await getOutboxStore().nextWakeAt(userId).catch(() => null);
      if (wakeAt === null || !activeRef.current) return;
      const delay = Math.max(wakeAt - Date.now(), minDelayMs);
      wakeTimerRef.current = setTimeout(() => void runDrainRef.current(), delay);
    },
    [userId]
  );

  const runDrain = useCallback(async () => {
    if (!activeRef.current) return;
    if (drainingRef.current) {
      rerunRef.current = true;
      return;
    }
    drainingRef.current = true;
    const store = getOutboxStore();
    const syncedDates = new Set<string>();
    let lockBusy = false;

    try {
      do {
        rerunRef.current = false;
        const outcome = await withDrainLock(async (lockHeld) => {
          // Only safe under the lock: no other tab can be mid-send.
          await store.resetStaleSending(userId, Date.now() - STALE_SENDING_MS);
          const before = await store.listByUser(userId);
          const result = await drainOutbox({
            store,
            userId,
            send: sendSet,
            onSynced,
            shouldContinue: () => activeRef.current && lockHeld(),
          });
          if (result.synced > 0) before.forEach((r) => syncedDates.add(r.date));
          return result;
        });
        lockBusy = outcome === null;
      } while (rerunRef.current && activeRef.current);

      if (syncedDates.size > 0) {
        for (const date of syncedDates) {
          void queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
        }
        void queryClient.invalidateQueries({ queryKey: ["workout", "unfinished"] });
      }
    } catch (error) {
      console.warn("[outbox] drain failed", error);
    } finally {
      drainingRef.current = false;
      void scheduleWake(lockBusy ? LOCK_BUSY_RETRY_MS : 1_000);
    }
  }, [onSynced, queryClient, scheduleWake, userId]);

  useEffect(() => {
    runDrainRef.current = runDrain;
  }, [runDrain]);

  useEffect(() => {
    const store = getOutboxStore();
    activeRef.current = true;
    // Mirror the queue into React state: now, and on every change from any tab.
    const load = () => {
      store
        .listByUser(userId)
        .then((list) => {
          if (!activeRef.current) return;
          recordsRef.current = list;
          setRecords(list);
        })
        .catch((error) => console.warn("[outbox] could not read the queue", error));
    };
    load();
    const unsubscribe = store.subscribe(load);

    // The shell mounts again after signing in: sets parked by a 401 get an
    // immediate try. Network and Retry-After backoffs keep their schedule.
    void store
      .releaseAuthPaused(userId)
      .catch(() => 0)
      .then(() => runDrainRef.current());

    const onOnline = () => void runDrainRef.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") void runDrainRef.current();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    const poll = setInterval(() => {
      if (recordsRef.current.some((r) => r.status !== "failed")) {
        void runDrainRef.current();
      }
    }, POLL_MS);

    return () => {
      activeRef.current = false;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    };
    // Mount-once per user; timers and listeners call runDrain through its ref.
  }, [userId]);

  const enqueueSet = useCallback(
    async (input: Omit<EnqueueInput, "userId">) => {
      const record = await getOutboxStore().enqueue({ ...input, userId });
      if (!persistRequestedRef.current) {
        persistRequestedRef.current = true;
        // Best effort: asks the browser not to evict our storage under pressure.
        // Never awaited — the set is already saved either way.
        navigator.storage?.persist?.().catch(() => {});
      }
      void runDrainRef.current();
      return record;
    },
    [userId]
  );

  const hasUnsynced = useCallback(
    async (sessionId: string) =>
      (await getOutboxStore().countBySession(userId, sessionId)) > 0,
    [userId]
  );

  // Removing a failed barrier can unblock later sets — drain right away
  // instead of leaving them on "Syncing" until the next poll.
  const discard = useCallback(async (clientRequestId: string) => {
    const removed = await getOutboxStore().discard(clientRequestId);
    if (removed) void runDrainRef.current();
    return removed;
  }, []);

  const discardSession = useCallback(
    async (sessionId: string) => {
      await getOutboxStore().discardSession(userId, sessionId);
      void runDrainRef.current();
    },
    [userId]
  );

  const recoverSession = useCallback(
    async (fromSessionId: string, date: string) => {
      const store = getOutboxStore();
      // Under the drain lock (waiting, not skipping) so no send interleaves
      // with the remap — and two tabs clicking "Save as a new workout" run one
      // after the other: the second finds nothing left and creates nothing.
      //
      // Not idempotent across a lost response: if POST /api/workout succeeds
      // but its reply never arrives, a retry creates a second session. The
      // orphan has no sets, is never listed (unfinished workouts exclude empty
      // ones), and is exactly the litter reapStaleSessions deletes after 24h —
      // the same outcome as tapping "Start Workout" and walking away.
      const newSessionId = await withDrainLockWaiting(async () => {
        const group = (await store.listByUser(userId)).filter(
          (r) => r.sessionId === fromSessionId
        );
        const stillGone = group.some(
          (r) => r.status === "failed" && r.failure?.kind === "gone"
        );
        if (!stillGone) return null;

        const res = await fetch("/api/workout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Refuse (401) if another tab signed in a different account:
            // these sets must never be saved into someone else's workout.
            [EXPECTED_USER_HEADER]: userId,
          },
          body: JSON.stringify({ mode: "RECALL", date }),
        });
        if (res.status === 401) throw new SignInRequiredError();
        if (!res.ok) throw new Error("Could not create a workout to recover into");
        const session = (await res.json()) as { id: string };

        // Put the new workout in the cache first, so the synced sets have a
        // session row to land in and never vanish from the screen.
        queryClient.setQueryData<SessionsCache>(
          ["workout", "sessions", date],
          (sessions) => {
            const seeded = { ...session, exerciseSets: [] };
            if (!sessions) return [seeded];
            return sessions.some((s) => s.id === session.id)
              ? sessions
              : [seeded, ...sessions];
          }
        );

        const moved = await store.remapSession(userId, fromSessionId, session.id);
        return moved > 0 ? session.id : null;
      });

      void queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
      void queryClient.invalidateQueries({ queryKey: ["workout", "unfinished"] });
      void runDrainRef.current();
      return newSessionId;
    },
    [queryClient, userId]
  );

  const reconcile = useCallback(
    (serverClientRequestIds: string[]) => {
      const known = new Set(recordsRef.current.map((r) => r.clientRequestId));
      const matches = serverClientRequestIds.filter((id) => known.has(id));
      if (matches.length === 0) return;
      void getOutboxStore()
        .deleteReconciled(userId, matches)
        .then((removed) => {
          if (removed > 0) void runDrainRef.current();
        })
        .catch((error) => console.warn("[outbox] reconcile failed", error));
    },
    [userId]
  );

  const value = useMemo<OutboxContextValue>(
    () => ({
      userId,
      records,
      needsLogin,
      enqueueSet,
      hasUnsynced,
      discard,
      discardSession,
      recoverSession,
      reconcile,
    }),
    [
      userId,
      records,
      needsLogin,
      enqueueSet,
      hasUnsynced,
      discard,
      discardSession,
      recoverSession,
      reconcile,
    ]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export function useOutbox(): OutboxContextValue {
  const value = useContext(OutboxContext);
  if (!value) throw new Error("useOutbox must be used inside <OutboxProvider>");
  return value;
}

/** For components that also render outside the signed-in shell (e.g. the landing page's user menu). */
export function useOptionalOutbox(): OutboxContextValue | null {
  return useContext(OutboxContext);
}
