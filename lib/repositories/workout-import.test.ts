/**
 * AI import row planning — set numbering and ordering invariants.
 *
 * The surrounding transaction (advisory lock, replay checks, FOR UPDATE) needs
 * a live Postgres and is not exercised here. planImportRows is the part that
 * decides what actually gets written, so it is pure and tested directly.
 */

import { describe, it, expect } from "vitest";
import { planImportRows } from "@/lib/repositories/workout.repository";

const BASE = Date.parse("2026-09-12T10:00:00.000Z");

function set(clientRequestId: string, weight?: number, reps?: number) {
  return { weight, reps, isWarmup: false, clientRequestId };
}

describe("planImportRows — set numbering", () => {
  it("numbers a fresh exercise from 1", () => {
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [{ exerciseId: "bench", sets: [set("a", 40, 12), set("b", 50, 10)] }],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    expect(rows.map((r) => r.setNumber)).toEqual([1, 2]);
  });

  it("continues from what the session already holds", () => {
    // The session already has 3 bench sets logged by hand.
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [{ exerciseId: "bench", sets: [set("a", 55, 8)] }],
      nextNumber: new Map([["bench", 4]]),
      baseMs: BASE,
    });

    expect(rows[0].setNumber).toBe(4);
  });

  it("keeps counting when one exercise appears twice in the same import", () => {
    // Real input: "bench 3x8 ... then finished with bench 1x5". Two lines, one
    // exercise. Restarting at 1 would collide with the unique index on
    // (session_id, exercise_id, set_number).
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [
        { exerciseId: "bench", sets: [set("a", 40, 8), set("b", 45, 8)] },
        { exerciseId: "squat", sets: [set("c", 80, 5)] },
        { exerciseId: "bench", sets: [set("d", 50, 5)] },
      ],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    const bench = rows.filter((r) => r.exerciseId === "bench");
    expect(bench.map((r) => r.setNumber)).toEqual([1, 2, 3]);
    expect(rows.filter((r) => r.exerciseId === "squat")[0].setNumber).toBe(1);
    // Every (exercise, setNumber) pair is unique — the constraint's invariant.
    const pairs = rows.map((r) => `${r.exerciseId}#${r.setNumber}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("planImportRows — display order", () => {
  it("gives every row a strictly increasing timestamp", () => {
    // Postgres now() is the TRANSACTION start time, so a bulk insert would
    // otherwise stamp every row identically and the database could return
    // "set 3, set 1, set 2" to the UI, which renders in created_at order.
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [
        { exerciseId: "bench", sets: [set("a", 40, 12), set("b", 50, 10)] },
        { exerciseId: "row", sets: [set("c", 60, 10)] },
      ],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    const times = rows.map((r) => r.createdAt.getTime());
    expect(times).toEqual([BASE, BASE + 1, BASE + 2]);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it("preserves the order the user described the workout in", () => {
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [
        { exerciseId: "squat", sets: [set("a", 80, 5)] },
        { exerciseId: "bench", sets: [set("b", 60, 8)] },
      ],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    expect(rows.map((r) => r.exerciseId)).toEqual(["squat", "bench"]);
  });
});

describe("planImportRows — field mapping", () => {
  it("stores a bodyweight set as null weight, never zero", () => {
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [{ exerciseId: "pushup", sets: [set("a", undefined, 15)] }],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    expect(rows[0].weight).toBeNull();
    expect(rows[0].reps).toBe(15);
  });

  it("carries each set's own idempotency key through unchanged", () => {
    const rows = planImportRows({
      sessionId: "s1",
      exercises: [{ exerciseId: "bench", sets: [set("key-a", 40, 12), set("key-b", 50, 10)] }],
      nextNumber: new Map(),
      baseMs: BASE,
    });

    expect(rows.map((r) => r.clientRequestId)).toEqual(["key-a", "key-b"]);
  });
});
