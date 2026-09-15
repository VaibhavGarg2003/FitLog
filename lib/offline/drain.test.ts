/**
 * Outbox drainer — response handling, ordering, and concurrency
 */
import "fake-indexeddb/auto";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  AUTH_PAUSE_MS,
  backoffMs,
  classifyStatus,
  drainOutbox,
  parseRetryAfter,
  type SendResult,
} from "./drain";
import { createOutboxStore, type OutboxStore } from "./outbox-store";
import type { EnqueueInput, OutboxRecord } from "./outbox-types";
import { withDrainLock } from "./transport";

const exercise = {
  id: "bench",
  name: "Bench Press",
  muscleGroup: "Chest",
  category: "COMPOUND",
  metValue: 5,
  isCompound: true,
};

function input(crid: string, sessionId = "s1"): EnqueueInput {
  return {
    userId: "u1",
    sessionId,
    date: "2026-09-15",
    exercise,
    payload: { exerciseId: "bench", setNumber: 1, weight: 60, reps: 8, isWarmup: false, clientRequestId: crid },
  };
}

async function storeWith(...ids: Array<string | [string, string]>) {
  const store = createOutboxStore(`drain-test-${crypto.randomUUID()}`);
  for (const id of ids) {
    if (typeof id === "string") await store.enqueue(input(id));
    else await store.enqueue(input(id[0], id[1]));
  }
  return store;
}

const ok = (record: OutboxRecord): SendResult => ({
  kind: "response",
  status: 201,
  body: { id: `srv-${record.clientRequestId}`, clientRequestId: record.clientRequestId },
});

const ids = async (store: OutboxStore) =>
  (await store.listByUser("u1")).map((r) => `${r.clientRequestId}:${r.status}`);

describe("classifyStatus", () => {
  it.each([
    [200, "ok"], [201, "ok"],
    [401, "auth"],
    [404, "gone"],
    [408, "retry"], [425, "retry"], [429, "retry"], [500, "retry"], [503, "retry"],
    [400, "rejected"], [403, "rejected"], [409, "rejected"], [422, "rejected"],
  ])("%i → %s", (status, expected) => {
    expect(classifyStatus(status)).toBe(expected);
  });
});

describe("parseRetryAfter / backoffMs", () => {
  it("reads seconds and HTTP dates, capped", () => {
    const now = Date.parse("2026-09-15T10:00:00Z");
    expect(parseRetryAfter("30", now)).toBe(30_000);
    expect(parseRetryAfter("Tue, 15 Sep 2026 10:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfter("99999", now)).toBe(10 * 60_000);
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });

  it("grows then caps", () => {
    expect([0, 1, 2, 3, 9].map(backoffMs)).toEqual([2_000, 5_000, 15_000, 60_000, 60_000]);
  });
});

describe("drainOutbox", () => {
  it("sends in order and deletes each record only after onSynced", async () => {
    const store = await storeWith("a", "b");
    const events: string[] = [];

    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async (r) => {
        events.push(`send:${r.clientRequestId}`);
        return ok(r);
      },
      onSynced: async (r) => {
        events.push(`synced:${r.clientRequestId}:${(await ids(store)).length}`);
      },
    });

    expect(outcome).toMatchObject({ synced: 2, stopReason: "idle" });
    // Record still present while onSynced runs → no flicker in the UI.
    expect(events).toEqual(["send:a", "synced:a:2", "send:b", "synced:b:1"]);
    expect(await ids(store)).toEqual([]);
  });

  it("keeps the record for retry if updating the UI cache fails", async () => {
    const store = await storeWith("a");
    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async (r) => ok(r),
      onSynced: async () => {
        throw new Error("cache broke");
      },
      now: () => 1_000,
    });
    expect(outcome.stopReason).toBe("retry-later");
    const [record] = await store.listByUser("u1");
    expect(record).toMatchObject({ status: "pending", attempts: 1, nextAttemptAt: 1_000 + 2_000 });
  });

  it("stops the pass on a network error and backs off", async () => {
    const store = await storeWith("a", "b");
    const send = vi.fn(async (): Promise<SendResult> => ({ kind: "network" }));
    const outcome = await drainOutbox({ store, userId: "u1", send, onSynced: async () => {}, now: () => 0 });

    expect(outcome.stopReason).toBe("retry-later");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await ids(store)).toEqual(["a:pending", "b:pending"]);
    // b was never tried, but it waits behind a — so the wake time is a's.
    expect(await store.nextWakeAt("u1")).toBe(2_000);
  });

  it("parks a set for a minute on 401 without counting an attempt", async () => {
    const store = await storeWith("a");
    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async () => ({ kind: "response", status: 401 }),
      onSynced: async () => {},
      now: () => 1_000,
    });
    expect(outcome.stopReason).toBe("needs-login");
    expect((await store.listByUser("u1"))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      nextAttemptAt: 1_000 + AUTH_PAUSE_MS,
      authPaused: true, // drives the "sign in again" banner until released or sent
    });
    // Not resent every second while logged out.
    const send = vi.fn();
    await drainOutbox({ store, userId: "u1", send, onSynced: async () => {}, now: () => 30_000 });
    expect(send).not.toHaveBeenCalled();
  });

  it("marks 404 as gone, blocks the rest of that session, and keeps other sessions flowing", async () => {
    const store = await storeWith("a", "b", ["c", "s2"]);
    const sent: string[] = [];
    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async (r) => {
        sent.push(r.clientRequestId);
        return r.clientRequestId === "a" ? { kind: "response", status: 404 } : ok(r);
      },
      onSynced: async () => {},
    });

    expect(sent).toEqual(["a", "c"]); // b waits behind the failed a
    expect(outcome).toMatchObject({ synced: 1, failed: 1, stopReason: "idle" });
    const [a] = await store.listByUser("u1");
    expect(a).toMatchObject({ status: "failed", failure: { kind: "gone", status: 404 } });
    expect(await ids(store)).toEqual(["a:failed", "b:pending"]);
  });

  it("marks other 4xx as rejected", async () => {
    const store = await storeWith("a");
    await drainOutbox({
      store,
      userId: "u1",
      send: async () => ({ kind: "response", status: 400 }),
      onSynced: async () => {},
    });
    expect((await store.listByUser("u1"))[0].failure).toEqual({ kind: "rejected", status: 400 });
  });

  it("honours Retry-After on 429 and persists it", async () => {
    const store = await storeWith("a");
    await drainOutbox({
      store,
      userId: "u1",
      send: async () => ({ kind: "response", status: 429, retryAfterMs: 30_000 }),
      onSynced: async () => {},
      now: () => 5_000,
    });
    expect(await store.nextWakeAt("u1")).toBe(35_000);
    // A later trigger before then sends nothing.
    const send = vi.fn();
    await drainOutbox({ store, userId: "u1", send, onSynced: async () => {}, now: () => 20_000 });
    expect(send).not.toHaveBeenCalled();
  });

  it("stops when shouldContinue turns false", async () => {
    const store = await storeWith("a", "b");
    let calls = 0;
    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async (r) => ok(r),
      onSynced: async () => {},
      // true before claiming a, true after a's response, false before b
      shouldContinue: () => calls++ < 2,
    });
    expect(outcome).toMatchObject({ synced: 1, stopReason: "stopped" });
    expect(await ids(store)).toEqual(["b:pending"]);
  });

  it("puts a set back untouched if its owner left while the request was in flight", async () => {
    // e.g. signed out mid-request: the 404 may belong to the NEXT user's cookies.
    const store = await storeWith("a");
    let owner = true;
    const outcome = await drainOutbox({
      store,
      userId: "u1",
      send: async () => {
        owner = false;
        return { kind: "response", status: 404 };
      },
      onSynced: async () => {},
      shouldContinue: () => owner,
      now: () => 7_000,
    });
    expect(outcome.stopReason).toBe("stopped");
    const [record] = await store.listByUser("u1");
    expect(record).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: 0 });
    expect(record.failure).toBeUndefined();
  });

  it("two drainers sharing a store never send the same set twice or overtake within a session", async () => {
    const store = await storeWith("a", "b", "c", ["x", "s2"], ["y", "s2"]);
    const sent: string[] = [];
    const inFlight = new Map<string, number>();
    let maxPerSession = 0;

    const send = async (r: OutboxRecord): Promise<SendResult> => {
      const n = (inFlight.get(r.sessionId) ?? 0) + 1;
      inFlight.set(r.sessionId, n);
      maxPerSession = Math.max(maxPerSession, n);
      sent.push(r.clientRequestId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight.set(r.sessionId, n - 1);
      return ok(r);
    };

    await Promise.all([
      drainOutbox({ store, userId: "u1", send, onSynced: async () => {} }),
      drainOutbox({ store, userId: "u1", send, onSynced: async () => {} }),
    ]);

    expect([...sent].sort()).toEqual(["a", "b", "c", "x", "y"]);
    expect(maxPerSession).toBe(1);
    expect(sent.filter((id) => ["a", "b", "c"].includes(id))).toEqual(["a", "b", "c"]);
    expect(await ids(store)).toEqual([]);
  });
});

describe("withDrainLock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips when another tab holds the Web Lock", async () => {
    let held = false;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _opts: unknown,
          cb: (lock: object | null) => Promise<unknown>
        ) => {
          if (held) return cb(null);
          held = true;
          try {
            return await cb({});
          } finally {
            held = false;
          }
        },
      },
    });

    let release!: () => void;
    const first = withDrainLock(() => new Promise<string>((r) => (release = () => r("first"))));
    const second = await withDrainLock(async () => "second");
    release();

    expect(second).toBeNull();
    expect(await first).toBe("first");
  });

  it("without Web Locks, only a visible tab drains", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { visibilityState: "hidden" });
    expect(await withDrainLock(async () => "ran")).toBeNull();

    vi.stubGlobal("document", { visibilityState: "visible" });
    expect(await withDrainLock(async () => "ran")).toBe("ran");
  });
});
