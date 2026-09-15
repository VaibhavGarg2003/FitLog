/**
 * addSet idempotent replay — the late-commit race
 *
 * Real timeline this guards (hard to orchestrate against live Postgres):
 *   A: POST set X starts its insert (not yet committed)
 *   C: a retry of X looks for X — not visible yet
 *   A: commits;  B: Finish takes the session lock and completes the workout
 *   C: the active-session lock finds nothing → would answer 404
 * X IS saved, so C must return it. The fix re-checks once before 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/supabase/prisma", () => ({
  prisma: {
    exerciseSet: { findFirst: (...args: unknown[]) => findFirst(...args) },
    $transaction: (fn: (tx: unknown) => unknown) => transaction(fn),
  },
}));

import { addSet } from "@/lib/repositories/workout.repository";
import { NotFoundError } from "@/lib/utils/errors";

const savedRow = { id: "set-1", clientRequestId: "X", setNumber: 1 };

beforeEach(() => {
  findFirst.mockReset();
  transaction.mockReset();
  // The active-session lock matches no row (session finished meanwhile).
  transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ $queryRaw: async () => [] })
  );
});

describe("addSet replay after a late commit", () => {
  it("returns the set that committed between the first lookup and the lock", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(savedRow);

    await expect(
      addSet("session-1", "user-1", { exerciseId: "bench", clientRequestId: "X" })
    ).resolves.toBe(savedRow);
    expect(findFirst).toHaveBeenCalledTimes(2);
    // Both lookups are owner-scoped.
    for (const [query] of findFirst.mock.calls) {
      expect(query.where).toMatchObject({ clientRequestId: "X", session: { userId: "user-1" } });
    }
  });

  it("still answers not found when the set was never saved", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      addSet("session-1", "user-1", { exerciseId: "bench", clientRequestId: "X" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not look anything up without a clientRequestId", async () => {
    await expect(
      addSet("session-1", "user-1", { exerciseId: "bench" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
