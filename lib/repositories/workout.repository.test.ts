/**
 * Workout repository pure helpers + service reaper isolation.
 *
 * Integration paths (FOR UPDATE, @updatedAt touch) need a live Postgres and
 * are not exercised here — see the implementer report for the call shapes
 * settled without a DB. These tests lock the invariants that do not need I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { planSetRenumbers } from "@/lib/repositories/workout.repository";

describe("planSetRenumbers — ascending renumber collision invariant", () => {
  it("is a no-op when numbers are already contiguous 1..n", () => {
    expect(planSetRenumbers([1, 2, 3])).toEqual([]);
  });

  it("only moves numbers down (no intermediate collision for positive unique input)", () => {
    // After deleting set 1 from [1,2,3] remaining is [2,3] → [1,2].
    const remaining = [2, 3];
    const steps = planSetRenumbers(remaining);

    // Simulate applying steps left-to-right; every intermediate state must
    // keep unique positive set numbers (the unique constraint would reject
    // a collision).
    const live = [...remaining];
    for (const step of steps) {
      live[step.index] = step.to;
      const positives = live.filter((n) => n > 0);
      expect(new Set(positives).size).toBe(positives.length);
      // Numbers only move down.
      expect(step.to).toBeLessThan(step.from);
    }
    expect(live).toEqual([1, 2]);
  });

  it("handles a hole in the middle without collision", () => {
    // After deleting set 2 from [1,2,3] remaining is [1,3] → [1,2].
    const remaining = [1, 3];
    const steps = planSetRenumbers(remaining);
    const live = [...remaining];
    for (const step of steps) {
      live[step.index] = step.to;
      expect(new Set(live).size).toBe(live.length);
      expect(step.to).toBeLessThan(step.from);
    }
    expect(live).toEqual([1, 2]);
  });

  it("proves the post-F1 invariant: positive unique sorted input never collides", () => {
    const cases = [
      [1, 2, 3, 4],
      [1, 2, 4, 5],
      [2, 3, 4],
      [1, 3, 5, 7],
      [5],
    ];
    for (const remaining of cases) {
      const live = [...remaining];
      for (const step of planSetRenumbers(remaining)) {
        live[step.index] = step.to;
        expect(new Set(live).size).toBe(live.length);
      }
      expect(live).toEqual(remaining.map((_, i) => i + 1));
    }
  });
});

// ── reaper failure must not block startSession ─────────────────────
// Mock the repository module before importing the service.

vi.mock("@/lib/repositories/workout.repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/repositories/workout.repository")>();
  return {
    ...actual,
    reapStaleSessions: vi.fn(),
    createSession: vi.fn(),
  };
});

import {
  reapStaleSessions,
  createSession,
} from "@/lib/repositories/workout.repository";
import { startSession } from "@/lib/services/workout.service";

describe("startSession + reaper isolation", () => {
  beforeEach(() => {
    vi.mocked(reapStaleSessions).mockReset();
    vi.mocked(createSession).mockReset();
  });

  it("still creates a session when the reaper throws", async () => {
    vi.mocked(reapStaleSessions).mockRejectedValue(new Error("db down"));
    vi.mocked(createSession).mockResolvedValue({
      id: "sess-1",
    } as Awaited<ReturnType<typeof createSession>>);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await startSession("user-1", {
      date: "2026-08-12",
      mode: "RECALL",
    });

    expect(reapStaleSessions).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledWith("user-1", {
      date: "2026-08-12",
      mode: "RECALL",
    });
    expect(result).toEqual({ id: "sess-1" });

    warn.mockRestore();
  });

  it("creates a session after a successful reaper run", async () => {
    vi.mocked(reapStaleSessions).mockResolvedValue(undefined);
    vi.mocked(createSession).mockResolvedValue({
      id: "sess-2",
    } as Awaited<ReturnType<typeof createSession>>);

    const result = await startSession("user-1", {
      date: "2026-08-12",
      mode: "LIVE",
    });

    expect(createSession).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: "sess-2" });
  });
});
