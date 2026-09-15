import { describe, it, expect } from "vitest";
import { mergeSessionSets, nextSetNumber, type ServerSet } from "./merge-sets";
import type { OutboxRecord } from "./outbox-types";

const bench = {
  id: "bench",
  name: "Bench Press",
  muscleGroup: "Chest",
  category: "COMPOUND",
  metValue: 5,
  isCompound: true,
};
const squat = { ...bench, id: "squat", name: "Squat", muscleGroup: "Legs" };

function server(id: string, exercise: typeof bench, setNumber: number, crid?: string): ServerSet {
  return { id, setNumber, weight: 60, reps: 8, rpe: null, isWarmup: false, clientRequestId: crid ?? null, exercise };
}

function queued(crid: string, exercise: typeof bench, seq: number, status: OutboxRecord["status"] = "pending"): OutboxRecord {
  return {
    clientRequestId: crid,
    userId: "u1",
    sessionId: "s1",
    date: "2026-09-15",
    exercise,
    payload: { exerciseId: exercise.id, setNumber: 99, weight: 70, reps: 6, isWarmup: false, clientRequestId: crid },
    seq,
    createdAt: seq,
    status,
    attempts: 0,
    nextAttemptAt: 0,
  };
}

describe("mergeSessionSets", () => {
  it("appends queued sets after server sets, numbered per exercise", () => {
    const merged = mergeSessionSets(
      [server("a", bench, 1), server("b", bench, 2), server("c", squat, 1)],
      [queued("q2", squat, 20), queued("q1", bench, 10), queued("q3", bench, 30)]
    );

    expect(merged.map((s) => `${s.kind}:${s.exercise.id}#${s.setNumber}`)).toEqual([
      "server:bench#1",
      "server:bench#2",
      "server:squat#1",
      "local:bench#3", // q1 (seq 10)
      "local:squat#2", // q2 (seq 20)
      "local:bench#4", // q3 (seq 30)
    ]);
  });

  it("ignores the client's advisory setNumber", () => {
    const [local] = mergeSessionSets([], [queued("q1", bench, 1)]);
    expect(local.setNumber).toBe(1);
  });

  it("shows a set once when the server already has its clientRequestId", () => {
    const merged = mergeSessionSets(
      [server("a", bench, 1, "q1")],
      [queued("q1", bench, 1), queued("q2", bench, 2)]
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].kind).toBe("server");
    expect(merged[1]).toMatchObject({ kind: "local", clientRequestId: "q2", setNumber: 2 });
  });

  it("carries sync state and failure for local sets", () => {
    const failed = { ...queued("q1", bench, 1, "failed"), failure: { kind: "gone" as const, status: 404 } };
    const [local] = mergeSessionSets([], [failed]);
    expect(local).toMatchObject({ kind: "local", syncState: "failed", failure: { kind: "gone" } });
  });
});

describe("nextSetNumber", () => {
  it("is one past the highest server or queued number for that exercise", () => {
    const merged = mergeSessionSets([server("a", bench, 1)], [queued("q1", bench, 1)]);
    expect(nextSetNumber(merged, "bench")).toBe(3);
    expect(nextSetNumber(merged, "squat")).toBe(1);
  });
});
