/**
 * Offline set outbox — IndexedDB storage
 * ══════════════════════════════════════
 *
 * WHY INDEXEDDB (not localStorage):
 * ─────────────────────────────────
 * Sets are the one thing a user must never lose. IndexedDB writes are
 * transactional, survive tab crashes and app restarts, and are shared by every
 * tab of the site. localStorage has no transactions, so two tabs could hand
 * out the same order number or overwrite each other's queue.
 *
 * ORDER (seq):
 * ────────────
 * The server numbers sets max + 1 per exercise, so sets must reach it in the
 * order they were logged. `seq` comes from a counter row in the `meta` store,
 * read and bumped in the SAME transaction that inserts the record — two tabs
 * enqueueing at once can never get the same or a reversed number.
 *
 * PER-SESSION BARRIERS (claimNext):
 * ─────────────────────────────────
 * Records are claimed strictly by seq, but a session whose earliest unsynced
 * record is sending, failed, or backing off blocks every LATER record in that
 * same session. Other sessions keep flowing. Sending set 3 before a set 2 that
 * is still retrying would give them each other's numbers.
 *
 * Every write notifies subscribers in this tab and, via BroadcastChannel,
 * every other tab — so all open views of the queue stay in sync.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  EnqueueInput,
  OutboxFailure,
  OutboxRecord,
} from "./outbox-types";

const DB_VERSION = 1;
export const DEFAULT_DB_NAME = "fitlog-offline";
const CHANNEL_NAME = "fitlog-outbox";
const SEQ_KEY = "seq";

interface OutboxDB extends DBSchema {
  sets: {
    key: string;
    value: OutboxRecord;
    indexes: {
      byUserSeq: [string, number];
    };
  };
  meta: {
    key: string;
    value: { key: string; value: number };
  };
}

type Listener = () => void;

export interface OutboxStore {
  enqueue(input: EnqueueInput): Promise<OutboxRecord>;
  listByUser(userId: string): Promise<OutboxRecord[]>;
  countByUser(userId: string): Promise<number>;
  /** Authoritative count straight from IndexedDB (not a React mirror). */
  countBySession(userId: string, sessionId: string): Promise<number>;
  /**
   * Make records parked by a 401 sendable now (the app shell mounted again,
   * usually right after signing in). Network / Retry-After backoffs are kept.
   */
  releaseAuthPaused(userId: string): Promise<number>;
  /** Claim the next sendable record (pending → sending), honouring barriers. */
  claimNext(userId: string, now: number): Promise<OutboxRecord | null>;
  markSucceeded(clientRequestId: string): Promise<void>;
  /**
   * Back to pending, not before `retryAt`. `countAttempt: false` when the set
   * isn't at fault; `authPaused: true` when waiting for the user to sign in.
   */
  scheduleRetry(
    clientRequestId: string,
    retryAt: number,
    countAttempt: boolean,
    authPaused?: boolean
  ): Promise<void>;
  markFailed(clientRequestId: string, failure: OutboxFailure): Promise<void>;
  /** Remove one record the user chose to throw away. Refuses a record mid-send. */
  discard(clientRequestId: string): Promise<boolean>;
  discardSession(userId: string, sessionId: string): Promise<void>;
  clearUser(userId: string): Promise<void>;
  /** Move a session's records to another session and make them sendable again. */
  remapSession(
    userId: string,
    fromSessionId: string,
    toSessionId: string
  ): Promise<number>;
  /** Recover records left "sending" by a tab that died. Call only while holding the drain lock. */
  resetStaleSending(userId: string, olderThan: number): Promise<number>;
  /** Delete records the server already has (their ids appear in fetched sets). */
  deleteReconciled(userId: string, serverClientRequestIds: Iterable<string>): Promise<number>;
  /** Earliest nextAttemptAt among pending records, or null. */
  nextWakeAt(userId: string): Promise<number | null>;
  subscribe(listener: Listener): () => void;
}

function userRange(userId: string) {
  return IDBKeyRange.bound([userId, -Infinity], [userId, Infinity]);
}

export function createOutboxStore(dbName: string = DEFAULT_DB_NAME): OutboxStore {
  let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;
  const listeners = new Set<Listener>();
  let channel: BroadcastChannel | null = null;

  function db() {
    if (!dbPromise) {
      dbPromise = openDB<OutboxDB>(dbName, DB_VERSION, {
        upgrade(database) {
          const sets = database.createObjectStore("sets", {
            keyPath: "clientRequestId",
          });
          sets.createIndex("byUserSeq", ["userId", "seq"]);
          database.createObjectStore("meta", { keyPath: "key" });
        },
      }).catch((error) => {
        // Let a later call try again (e.g. storage was temporarily blocked).
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  function getChannel() {
    if (channel || typeof BroadcastChannel === "undefined") return channel;
    channel = new BroadcastChannel(`${CHANNEL_NAME}:${dbName}`);
    channel.onmessage = () => listeners.forEach((l) => l());
    return channel;
  }

  function notify() {
    listeners.forEach((l) => l());
    getChannel()?.postMessage("changed");
  }

  async function update(
    clientRequestId: string,
    change: (record: OutboxRecord) => OutboxRecord | null
  ) {
    const database = await db();
    const tx = database.transaction("sets", "readwrite");
    const record = await tx.store.get(clientRequestId);
    if (record) {
      const next = change(record);
      if (next) await tx.store.put(next);
    }
    await tx.done;
    if (record) notify();
  }

  return {
    async enqueue(input) {
      const database = await db();
      const tx = database.transaction(["sets", "meta"], "readwrite");
      const sets = tx.objectStore("sets");
      const meta = tx.objectStore("meta");

      // Same id already queued (a retried enqueue whose first attempt did
      // commit): return it rather than inserting twice.
      const existing = await sets.get(input.payload.clientRequestId);
      if (existing) {
        await tx.done;
        return existing;
      }

      const now = Date.now();
      const last = (await meta.get(SEQ_KEY))?.value ?? 0;
      const seq = Math.max(last + 1, now);
      await meta.put({ key: SEQ_KEY, value: seq });

      const record: OutboxRecord = {
        clientRequestId: input.payload.clientRequestId,
        userId: input.userId,
        sessionId: input.sessionId,
        date: input.date,
        exercise: input.exercise,
        payload: input.payload,
        seq,
        createdAt: now,
        status: "pending",
        attempts: 0,
        nextAttemptAt: 0,
      };
      await sets.add(record);
      await tx.done;
      notify();
      return record;
    },

    async listByUser(userId) {
      const database = await db();
      return database.getAllFromIndex("sets", "byUserSeq", userRange(userId));
    },

    async countByUser(userId) {
      const database = await db();
      return database.countFromIndex("sets", "byUserSeq", userRange(userId));
    },

    async countBySession(userId, sessionId) {
      const database = await db();
      const records = await database.getAllFromIndex("sets", "byUserSeq", userRange(userId));
      return records.filter((r) => r.sessionId === sessionId).length;
    },

    async releaseAuthPaused(userId) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let reset = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        const record = cursor.value;
        if (record.status === "pending" && record.authPaused) {
          await cursor.update({ ...record, nextAttemptAt: 0, authPaused: false });
          reset++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      if (reset) notify();
      return reset;
    },

    async claimNext(userId, now) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      const blocked = new Set<string>();
      let claimed: OutboxRecord | null = null;

      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        const record = cursor.value;
        if (!blocked.has(record.sessionId)) {
          const sendable =
            record.status === "pending" && record.nextAttemptAt <= now;
          if (sendable) {
            claimed = { ...record, status: "sending", sendingSince: now };
            await cursor.update(claimed);
            break;
          }
          // Sending, failed, or waiting out a backoff: everything after it in
          // this session must wait too.
          blocked.add(record.sessionId);
        }
        cursor = await cursor.continue();
      }

      await tx.done;
      if (claimed) notify();
      return claimed;
    },

    async markSucceeded(clientRequestId) {
      const database = await db();
      const existed = await database.get("sets", clientRequestId);
      await database.delete("sets", clientRequestId);
      if (existed) notify();
    },

    async scheduleRetry(clientRequestId, retryAt, countAttempt, authPaused = false) {
      await update(clientRequestId, (record) => ({
        ...record,
        status: "pending",
        attempts: record.attempts + (countAttempt ? 1 : 0),
        nextAttemptAt: retryAt,
        sendingSince: undefined,
        authPaused,
      }));
    },

    async markFailed(clientRequestId, failure) {
      await update(clientRequestId, (record) => ({
        ...record,
        status: "failed",
        attempts: record.attempts + 1,
        sendingSince: undefined,
        // The server has answered for real; any earlier sign-in pause is over.
        authPaused: false,
        failure,
      }));
    },

    async discard(clientRequestId) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      const record = await tx.store.get(clientRequestId);
      const allowed = !!record && record.status !== "sending";
      if (allowed) await tx.store.delete(clientRequestId);
      await tx.done;
      if (allowed) notify();
      return allowed;
    },

    async discardSession(userId, sessionId) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let removed = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        if (cursor.value.sessionId === sessionId) {
          await cursor.delete();
          removed++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      if (removed) notify();
    },

    async clearUser(userId) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let removed = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        await cursor.delete();
        removed++;
        cursor = await cursor.continue();
      }
      await tx.done;
      if (removed) notify();
    },

    async remapSession(userId, fromSessionId, toSessionId) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let moved = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        const record = cursor.value;
        if (record.sessionId === fromSessionId && record.status !== "sending") {
          await cursor.update({
            ...record,
            sessionId: toSessionId,
            status: "pending",
            attempts: 0,
            nextAttemptAt: 0,
            sendingSince: undefined,
            failure: undefined,
            authPaused: false,
          });
          moved++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      if (moved) notify();
      return moved;
    },

    async resetStaleSending(userId, olderThan) {
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let reset = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        const record = cursor.value;
        if (
          record.status === "sending" &&
          (record.sendingSince ?? 0) < olderThan
        ) {
          // Safe to resend: the server dedupes on clientRequestId.
          await cursor.update({
            ...record,
            status: "pending",
            sendingSince: undefined,
          });
          reset++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      if (reset) notify();
      return reset;
    },

    async deleteReconciled(userId, serverClientRequestIds) {
      const ids = new Set(serverClientRequestIds);
      if (ids.size === 0) return 0;
      const database = await db();
      const tx = database.transaction("sets", "readwrite");
      let removed = 0;
      let cursor = await tx.store.index("byUserSeq").openCursor(userRange(userId));
      while (cursor) {
        if (ids.has(cursor.value.clientRequestId)) {
          await cursor.delete();
          removed++;
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      if (removed) notify();
      return removed;
    },

    async nextWakeAt(userId) {
      const database = await db();
      const records = await database.getAllFromIndex(
        "sets",
        "byUserSeq",
        userRange(userId)
      );
      // Same barrier rule as claimNext: only the FIRST unsynced record of each
      // session can be sent next, so only its time matters. A set queued
      // behind a backing-off one must not wake the drainer early.
      const seen = new Set<string>();
      let earliest: number | null = null;
      for (const r of records) {
        if (seen.has(r.sessionId)) continue;
        seen.add(r.sessionId);
        if (r.status === "pending") {
          earliest = earliest === null ? r.nextAttemptAt : Math.min(earliest, r.nextAttemptAt);
        }
      }
      return earliest;
    },

    subscribe(listener) {
      listeners.add(listener);
      getChannel();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let defaultStore: OutboxStore | null = null;

/** The app's shared outbox (browser only). */
export function getOutboxStore(): OutboxStore {
  if (!defaultStore) defaultStore = createOutboxStore();
  return defaultStore;
}
