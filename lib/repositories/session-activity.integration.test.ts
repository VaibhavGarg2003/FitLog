/**
 * Session activity touch — live Postgres integration
 * ═══════════════════════════════════════════════════
 *
 * Asserts that set create / edit / delete genuinely advance
 * `workout_sessions.updated_at`, and that the reaper does not cancel a
 * session whose activity was just touched. The source-shape suite in
 * session-activity.test.ts still guards against switching the touch path
 * back to a bare Prisma `@updatedAt` write; this file proves the column
 * moves when a real database is available.
 *
 * HOW TO RUN (not part of default CI — skips when env is unset):
 * ─────────────────────────────────────────────────────────────
 *   docker run -d --name fitlog-test-pg \
 *     -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
 *
 *   # Point Prisma at the throwaway DB and apply migrations (operator step):
 *   # DATABASE_URL / DIRECT_URL → postgresql://postgres:postgres@localhost:5433/postgres
 *   # npx prisma migrate deploy
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres npm test
 *
 * Without TEST_DATABASE_URL the suite is skipped cleanly so `npm test` stays
 * green in CI (which does not provision a database).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("session activity (integration)", () => {
  let prisma: PrismaClient;
  let addSet: typeof import("./workout.repository").addSet;
  let updateSetForUser: typeof import("./workout.repository").updateSetForUser;
  let deleteSetForUser: typeof import("./workout.repository").deleteSetForUser;
  let reapStaleSessions: typeof import("./workout.repository").reapStaleSessions;
  let createSession: typeof import("./workout.repository").createSession;
  let cancelActiveSessionForUser: typeof import("./workout.repository").cancelActiveSessionForUser;
  let getSessionsByDate: typeof import("./workout.repository").getSessionsByDate;
  let deleteSession: typeof import("./workout.repository").deleteSession;

  const userId = crypto.randomUUID();
  const exerciseId = crypto.randomUUID();
  let sessionId: string;

  beforeAll(async () => {
    // Point the app Prisma singleton at the test DB, then re-load modules so
    // createPrismaClient() captures TEST_DATABASE_URL (not a stale singleton).
    process.env.DATABASE_URL = TEST_URL!;
    vi.resetModules();

    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }

    const prismaMod = await import("@/lib/supabase/prisma");
    prisma = prismaMod.prisma;

    const repo = await import("@/lib/repositories/workout.repository");
    addSet = repo.addSet;
    updateSetForUser = repo.updateSetForUser;
    deleteSetForUser = repo.deleteSetForUser;
    reapStaleSessions = repo.reapStaleSessions;
    createSession = repo.createSession;
    cancelActiveSessionForUser = repo.cancelActiveSessionForUser;
    getSessionsByDate = repo.getSessionsByDate;
    deleteSession = repo.deleteSession;

    await prisma.user.create({
      data: {
        id: userId,
        email: `activity-itest-${userId}@example.com`,
      },
    });

    await prisma.exercise.create({
      data: {
        id: exerciseId,
        name: "Integration Bench",
        category: "COMPOUND",
        muscleGroup: "Chest",
        metValue: 5,
        isCompound: true,
      },
    });

    const session = await createSession(userId, {
      date: "2026-08-12",
      mode: "RECALL",
    });
    sessionId = session.id;
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    // Cascade from user removes sessions/sets.
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.exercise.delete({ where: { id: exerciseId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  async function readUpdatedAt(id: string): Promise<Date> {
    const row = await prisma.workoutSession.findUniqueOrThrow({
      where: { id },
      select: { updatedAt: true },
    });
    return row.updatedAt;
  }

  /** Ensure the next write can produce a strictly later timestamp. */
  async function waitPast(previous: Date): Promise<void> {
    const minWaitMs = Math.max(5, previous.getTime() + 2 - Date.now());
    await new Promise((r) => setTimeout(r, minWaitMs));
  }

  it("advances parent updated_at on set create", async () => {
    // Push updated_at into the past so a successful touch is unambiguous.
    await prisma.$executeRaw`
      UPDATE workout_sessions
      SET updated_at = now() - interval '1 hour'
      WHERE id = ${sessionId}
    `;
    const before = await readUpdatedAt(sessionId);
    await waitPast(before);

    await addSet(sessionId, userId, {
      exerciseId,
      weight: 60,
      reps: 8,
      clientRequestId: crypto.randomUUID(),
    });

    const after = await readUpdatedAt(sessionId);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("advances parent updated_at on set edit", async () => {
    const set = await prisma.exerciseSet.findFirstOrThrow({
      where: { sessionId },
      select: { id: true },
    });

    await prisma.$executeRaw`
      UPDATE workout_sessions
      SET updated_at = now() - interval '1 hour'
      WHERE id = ${sessionId}
    `;
    const before = await readUpdatedAt(sessionId);
    await waitPast(before);

    const ok = await updateSetForUser(set.id, sessionId, userId, {
      weight: 62.5,
    });
    expect(ok).toBe(true);

    const after = await readUpdatedAt(sessionId);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("advances parent updated_at on set delete", async () => {
    // Ensure at least one set remains to delete.
    const extra = await addSet(sessionId, userId, {
      exerciseId,
      weight: 40,
      reps: 10,
      clientRequestId: crypto.randomUUID(),
    });

    await prisma.$executeRaw`
      UPDATE workout_sessions
      SET updated_at = now() - interval '1 hour'
      WHERE id = ${sessionId}
    `;
    const before = await readUpdatedAt(sessionId);
    await waitPast(before);

    const ok = await deleteSetForUser(extra.id, sessionId, userId);
    expect(ok).toBe(true);

    const after = await readUpdatedAt(sessionId);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("reaper does not cancel a session whose updated_at was just touched", async () => {
    // Make the session look stale, then touch via a set mutation.
    await prisma.$executeRaw`
      UPDATE workout_sessions
      SET updated_at = now() - interval '48 hours',
          status = 'IN_PROGRESS'
      WHERE id = ${sessionId}
    `;

    await addSet(sessionId, userId, {
      exerciseId,
      weight: 55,
      reps: 5,
      clientRequestId: crypto.randomUUID(),
    });

    // Touch moved updated_at to now; 24h reaper must spare the session.
    await reapStaleSessions(userId, 24);

    const session = await prisma.workoutSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true },
    });
    expect(session.status).toBe("IN_PROGRESS");
  });

  // ── The rule: a session with sets is a record; an empty one is litter ──
  //
  // These three cover the behaviour the reaper exists to get right, and the
  // regression that an earlier version introduced by CANCELLING stale
  // sessions that held real sets.

  it("deletes a stale EMPTY session (litter)", async () => {
    const empty = await createSession(userId, {
      date: "2026-01-05",
      mode: "RECALL",
    });
    await prisma.$executeRaw`
      UPDATE workout_sessions SET updated_at = now() - interval '48 hours'
      WHERE id = ${empty.id}
    `;

    await reapStaleSessions(userId, 24);

    const found = await prisma.workoutSession.findUnique({
      where: { id: empty.id },
      select: { id: true },
    });
    expect(found).toBeNull();
  });

  it("preserves a stale session that HAS sets — never deleted, never cancelled", async () => {
    const kept = await createSession(userId, {
      date: "2026-01-06",
      mode: "RECALL",
    });
    await addSet(kept.id, userId, {
      exerciseId,
      weight: 40,
      reps: 8,
      clientRequestId: crypto.randomUUID(),
    });
    // Make it look long-abandoned: 30 days without a touch.
    await prisma.$executeRaw`
      UPDATE workout_sessions SET updated_at = now() - interval '30 days'
      WHERE id = ${kept.id}
    `;

    await reapStaleSessions(userId, 24);

    const after = await prisma.workoutSession.findUnique({
      where: { id: kept.id },
      select: { status: true },
    });
    expect(after).not.toBeNull();
    expect(after!.status).toBe("IN_PROGRESS");
  });

  it("discard after sets does not reappear as unfinished", async () => {
    const discarded = await createSession(userId, {
      date: "2026-01-08",
      mode: "RECALL",
    });
    await addSet(discarded.id, userId, {
      exerciseId,
      weight: 25,
      reps: 12,
      clientRequestId: crypto.randomUUID(),
    });

    const ok = await cancelActiveSessionForUser(discarded.id, userId);
    expect(ok).toBe(true);

    // CANCELLED, so getSessionsByDate filters it out — it cannot come back as
    // an "Unfinished · Resume" card the user already dismissed.
    const visible = await getSessionsByDate(userId, "2026-01-08");
    expect(visible.map((s) => s.id)).not.toContain(discarded.id);

    // Soft-cancel: the sets are still there, so a mis-tap is recoverable.
    const setsKept = await prisma.exerciseSet.count({
      where: { sessionId: discarded.id },
    });
    expect(setsKept).toBe(1);

    // And it can no longer be written to.
    await expect(
      addSet(discarded.id, userId, {
        exerciseId,
        weight: 25,
        reps: 12,
        clientRequestId: crypto.randomUUID(),
      })
    ).rejects.toThrow();

    // Second discard is a no-op, not a crash.
    expect(await cancelActiveSessionForUser(discarded.id, userId)).toBe(false);
  });

  /**
   * THE DATA-LOSS INVARIANT.
   *
   * The reaper's FOR UPDATE lock is scoped to EMPTY sessions (so it does not
   * contend with someone adding a set to an older session). That narrowing is
   * exactly the kind of change that reopens a TOCTOU gap, so it is asserted
   * here rather than argued: can a session be deleted in the window between
   * the reaper's lock query and its deleteMany, taking a concurrently-inserted
   * first set down with it via ON DELETE CASCADE?
   *
   * The bad state is NOT "addSet failed" — that is a correct outcome. It is
   * "addSet RESOLVED, so the user was told the set was logged, but the row is
   * gone." Racing the two operations on the same empty stale session and
   * asserting that invariant is what actually settles it.
   */
  it("reaper cannot delete a session out from under a concurrent first set", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const raced = await createSession(userId, {
        date: "2026-01-10",
        mode: "RECALL",
      });
      await prisma.$executeRaw`
        UPDATE workout_sessions SET updated_at = now() - interval '48 hours'
        WHERE id = ${raced.id}
      `;

      const [addResult, reapResult] = await Promise.allSettled([
        addSet(raced.id, userId, {
          exerciseId,
          weight: 20,
          reps: 5,
          clientRequestId: crypto.randomUUID(),
        }),
        reapStaleSessions(userId, 24),
      ]);

      // The reaper itself must succeed, otherwise a rejected addSet plus a
      // broken reaper would satisfy the assertions below without either
      // expected race outcome having actually occurred.
      expect(reapResult.status).toBe("fulfilled");

      const survived = await prisma.workoutSession.findUnique({
        where: { id: raced.id },
        select: { id: true },
      });
      const setCount = await prisma.exerciseSet.count({
        where: { sessionId: raced.id },
      });

      if (addResult.status === "fulfilled") {
        // The server said it logged the set — it must actually be there.
        expect(survived).not.toBeNull();
        expect(setCount).toBe(1);
      } else {
        // Reaper won the lock. The session must actually be GONE — asserting
        // only setCount === 0 would also pass if addSet had failed for an
        // unrelated reason while the session survived, which is not the race
        // outcome this test exists to prove.
        expect(survived).toBeNull();
        expect(setCount).toBe(0);
      }

      if (survived) {
        await prisma.workoutSession
          .delete({ where: { id: raced.id } })
          .catch(() => {});
      }
    }
  }, 30_000);

  it("deleting an unfinished session removes it and its sets", async () => {
    const doomed = await createSession(userId, {
      date: "2026-01-11",
      mode: "RECALL",
    });
    await addSet(doomed.id, userId, {
      exerciseId,
      weight: 15,
      reps: 20,
      clientRequestId: crypto.randomUUID(),
    });

    await deleteSession(doomed.id, userId);

    expect(
      await prisma.workoutSession.findUnique({ where: { id: doomed.id } })
    ).toBeNull();
    // ON DELETE CASCADE — the sets go with it. This is the "just get rid of
    // it" path, unlike cancel, which keeps them.
    expect(
      await prisma.exerciseSet.count({ where: { sessionId: doomed.id } })
    ).toBe(0);
  });

  it("does not let one user delete another user's session", async () => {
    const mine = await createSession(userId, {
      date: "2026-01-12",
      mode: "RECALL",
    });
    const stranger = crypto.randomUUID();

    await expect(deleteSession(mine.id, stranger)).rejects.toThrow();

    expect(
      await prisma.workoutSession.findUnique({ where: { id: mine.id } })
    ).not.toBeNull();
  });

  it("does not let one user discard another user's session", async () => {
    const mine = await createSession(userId, {
      date: "2026-01-09",
      mode: "RECALL",
    });
    const stranger = crypto.randomUUID();
    expect(await cancelActiveSessionForUser(mine.id, stranger)).toBe(false);

    const still = await prisma.workoutSession.findUniqueOrThrow({
      where: { id: mine.id },
      select: { status: true },
    });
    expect(still.status).toBe("IN_PROGRESS");
  });

  it("lets a user add a set to a long-stale session (the back-filler)", async () => {
    const old = await createSession(userId, {
      date: "2026-01-07",
      mode: "RECALL",
    });
    await addSet(old.id, userId, {
      exerciseId,
      weight: 30,
      reps: 10,
      clientRequestId: crypto.randomUUID(),
    });
    await prisma.$executeRaw`
      UPDATE workout_sessions SET updated_at = now() - interval '30 days'
      WHERE id = ${old.id}
    `;

    // Reaper runs (as it would when they start today's workout)...
    await reapStaleSessions(userId, 24);

    // ...and they can still come back and add to that older session.
    const added = await addSet(old.id, userId, {
      exerciseId,
      weight: 35,
      reps: 8,
      clientRequestId: crypto.randomUUID(),
    });
    expect(added.setNumber).toBe(2);

    const sets = await prisma.exerciseSet.count({
      where: { sessionId: old.id },
    });
    expect(sets).toBe(2);
  });
});
