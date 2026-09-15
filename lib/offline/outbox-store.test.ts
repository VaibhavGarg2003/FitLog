/**
 * Outbox store — real IndexedDB transactions (fake-indexeddb in Node)
 */
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { createOutboxStore } from "./outbox-store";
import type { EnqueueInput } from "./outbox-types";

let dbCounter = 0;
const freshDbName = () => `outbox-test-${++dbCounter}-${crypto.randomUUID()}`;

const exercise = {
  id: "bench",
  name: "Bench Press",
  muscleGroup: "Chest",
  category: "COMPOUND",
  metValue: 5,
  isCompound: true,
};

function input(crid: string, overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    userId: "u1",
    sessionId: "s1",
    date: "2026-09-15",
    exercise,
    payload: { exerciseId: "bench", setNumber: 1, weight: 60, reps: 8, isWarmup: false, clientRequestId: crid },
    ...overrides,
  };
}

describe("outbox store", () => {
  it("allocates strictly increasing seq across two tabs enqueueing at once", async () => {
    const name = freshDbName();
    const tabA = createOutboxStore(name);
    const tabB = createOutboxStore(name);

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? tabA : tabB).enqueue(input(`c${i}`))
      )
    );

    const records = await tabA.listByUser("u1");
    const seqs = records.map((r) => r.seq);
    expect(records).toHaveLength(20);
    expect(new Set(seqs).size).toBe(20);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("returns the existing record when the same set is enqueued twice", async () => {
    const store = createOutboxStore(freshDbName());
    const first = await store.enqueue(input("same"));
    const second = await store.enqueue(input("same"));
    expect(second.seq).toBe(first.seq);
    expect(await store.countByUser("u1")).toBe(1);
  });

  it("claims in order and never lists or claims another user's records", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("mine-1"));
    await store.enqueue(input("theirs", { userId: "u2" }));
    await store.enqueue(input("mine-2"));

    expect((await store.listByUser("u1")).map((r) => r.clientRequestId)).toEqual(["mine-1", "mine-2"]);
    const claimed = await store.claimNext("u1", Date.now());
    expect(claimed).toMatchObject({ clientRequestId: "mine-1", status: "sending" });
  });

  it("blocks later sets of a session behind one that is sending", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("s1-a"));
    await store.enqueue(input("s1-b"));
    await store.enqueue(input("s2-a", { sessionId: "s2" }));

    await store.claimNext("u1", Date.now()); // s1-a → sending
    const next = await store.claimNext("u1", Date.now());
    expect(next?.clientRequestId).toBe("s2-a");
    expect(await store.claimNext("u1", Date.now())).toBeNull();
  });

  it("a failed set blocks only its own session", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("s1-a"));
    await store.enqueue(input("s1-b"));
    await store.enqueue(input("s2-a", { sessionId: "s2" }));

    await store.claimNext("u1", Date.now());
    await store.markFailed("s1-a", { kind: "rejected", status: 400 });

    expect((await store.claimNext("u1", Date.now()))?.clientRequestId).toBe("s2-a");
    expect(await store.claimNext("u1", Date.now())).toBeNull();

    // Discarding the failure reopens the session.
    expect(await store.discard("s1-a")).toBe(true);
    expect((await store.claimNext("u1", Date.now()))?.clientRequestId).toBe("s1-b");
  });

  it("a backing-off set holds its session until nextAttemptAt", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.enqueue(input("b"));
    const now = Date.now();

    await store.claimNext("u1", now);
    await store.scheduleRetry("a", now + 5_000, true);

    expect(await store.claimNext("u1", now + 1_000)).toBeNull();
    expect(await store.nextWakeAt("u1")).toBe(now + 5_000);
    expect((await store.claimNext("u1", now + 5_000))?.clientRequestId).toBe("a");
  });

  it("counts an attempt only when asked (401 pauses don't)", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.claimNext("u1", Date.now());
    await store.scheduleRetry("a", 0, false);
    expect((await store.listByUser("u1"))[0].attempts).toBe(0);
    await store.claimNext("u1", Date.now());
    await store.scheduleRetry("a", 0, true);
    expect((await store.listByUser("u1"))[0].attempts).toBe(1);
  });

  it("recovers a record left sending by a dead tab, but not a fresh one", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("old"));
    await store.enqueue(input("fresh", { sessionId: "s2" }));
    const now = Date.now();
    await store.claimNext("u1", now - 120_000); // old → sending 2 min ago
    await store.claimNext("u1", now); // fresh → sending now

    expect(await store.resetStaleSending("u1", now - 60_000)).toBe(1);
    const byId = Object.fromEntries((await store.listByUser("u1")).map((r) => [r.clientRequestId, r.status]));
    expect(byId).toEqual({ old: "pending", fresh: "sending" });
  });

  it("refuses to discard a set mid-send", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.claimNext("u1", Date.now());
    expect(await store.discard("a")).toBe(false);
    expect(await store.countByUser("u1")).toBe(1);
  });

  it("remaps a gone session's sets to a new session, ready to send", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.enqueue(input("b"));
    await store.claimNext("u1", Date.now());
    await store.markFailed("a", { kind: "gone", status: 404 });

    expect(await store.remapSession("u1", "s1", "s-new")).toBe(2);
    const records = await store.listByUser("u1");
    expect(records.map((r) => [r.sessionId, r.status, r.failure])).toEqual([
      ["s-new", "pending", undefined],
      ["s-new", "pending", undefined],
    ]);
    expect((await store.claimNext("u1", Date.now()))?.clientRequestId).toBe("a");
  });

  it("deletes records the server already has, even failed ones", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.enqueue(input("b"));
    await store.claimNext("u1", Date.now());
    await store.markFailed("a", { kind: "gone", status: 404 });

    expect(await store.deleteReconciled("u1", ["a", "not-queued"])).toBe(1);
    expect((await store.listByUser("u1")).map((r) => r.clientRequestId)).toEqual(["b"]);
  });

  it("discardSession and clearUser touch only their scope", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("s1"));
    await store.enqueue(input("s2", { sessionId: "s2" }));
    await store.enqueue(input("other", { userId: "u2" }));

    await store.discardSession("u1", "s1");
    expect((await store.listByUser("u1")).map((r) => r.clientRequestId)).toEqual(["s2"]);

    await store.clearUser("u1");
    expect(await store.countByUser("u1")).toBe(0);
    expect(await store.countByUser("u2")).toBe(1);
  });

  it("a real failure clears an earlier sign-in pause", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.claimNext("u1", Date.now());
    await store.scheduleRetry("a", 0, false, true);
    await store.claimNext("u1", Date.now());
    await store.markFailed("a", { kind: "gone", status: 404 });
    expect((await store.listByUser("u1"))[0]).toMatchObject({ status: "failed", authPaused: false });
  });

  it("counts a session's records straight from storage", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("a"));
    await store.enqueue(input("b", { sessionId: "s2" }));
    await store.enqueue(input("c", { userId: "u2" }));
    expect(await store.countBySession("u1", "s1")).toBe(1);
    expect(await store.countBySession("u1", "s2")).toBe(1);
    expect(await store.countBySession("u1", "s3")).toBe(0);
  });

  it("releaseAuthPaused frees only sets parked by a 401 (signed in again)", async () => {
    const store = createOutboxStore(freshDbName());
    await store.enqueue(input("auth"));
    await store.enqueue(input("net", { sessionId: "s2" }));
    const now = Date.now();
    await store.claimNext("u1", now);
    await store.claimNext("u1", now);
    await store.scheduleRetry("auth", now + 60_000, false, true);
    await store.scheduleRetry("net", now + 60_000, true); // network / Retry-After backoff
    expect(await store.claimNext("u1", now)).toBeNull();

    expect(await store.releaseAuthPaused("u1")).toBe(1);
    const claimed = await store.claimNext("u1", now);
    expect(claimed).toMatchObject({ clientRequestId: "auth", authPaused: false });
    // The server-requested backoff still holds.
    expect(await store.claimNext("u1", now)).toBeNull();
  });

  it("notifies subscribers on change", async () => {
    const store = createOutboxStore(freshDbName());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    await store.enqueue(input("a"));
    unsubscribe();
    await store.enqueue(input("b"));
    expect(calls).toBe(1);
  });
});
