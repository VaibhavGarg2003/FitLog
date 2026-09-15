/**
 * Target History Repository — what were the user's targets on a given day?
 * ═════════════════════════════════════════════════════════════════════════
 *
 * TABLE USED:
 * ───────────
 * TargetRevision — one row per user per calendar day the targets changed.
 * The targets in force on date D = the latest row with effectiveFrom <= D.
 *
 * WHY IT EXISTS:
 * ──────────────
 * Profile keeps only the CURRENT targets. Without this table, a user who cut
 * at 1,800 kcal in March and bulked at 2,600 from April has March judged
 * against 2,600 forever after.
 *
 * WRITE RULE:
 * ───────────
 * recordTargetRevision() takes a TRANSACTION client and must run in the same
 * transaction as the profile write that produced the targets, AFTER that
 * write. See profile.repository.ts for why the order matters.
 *
 * The decision of WHETHER and ON WHICH DAY to write is planTargetRevision(),
 * a pure function so it is tested without a database (same approach as
 * planImportRows in workout.repository.ts).
 */

import type { FitnessGoal, Prisma, TargetSource } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";

/** The values one revision records. */
export interface TargetSnapshot {
  tdee: number | null;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  goal: FitnessGoal | null;
  weightKg: number | null;
}

/** The latest stored revision, as far as planning needs to know. */
export interface LatestRevision {
  effectiveFrom: string; // "YYYY-MM-DD"
  tdee: number | null;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  goal: FitnessGoal | null;
}

export type RevisionPlan =
  | { write: false }
  | { write: true; effectiveFrom: string };

/**
 * Decide whether a new target snapshot needs a history row, and for which day.
 *
 * 1. NOTHING CHANGED → no row. recalculateProfile() reruns the engine on every
 *    Settings save, even one that only touched something unrelated; without
 *    this every save would add a duplicate row.
 *    Compared: tdee, the four targets, and goal. Body weight alone is NOT a
 *    target change — it is recorded as context when targets do change.
 *
 * 2. CHANGED → a row dated `today` (the user's calendar date). A second change
 *    on the same day overwrites that day's row: the day's last value wins.
 *
 * 3. CLOCK WENT BACKWARDS → date it on the latest row's day instead.
 *    If the latest row is dated Oct 5 (saved in India) and the user's device is
 *    now somewhere it is still Oct 4, a new Oct 4 row would sort BEFORE the
 *    Oct 5 row — and "latest on or before today" would keep returning the old
 *    Oct 5 values. Never write behind the latest row.
 *
 * No previous row at all (brand-new user, or an account the backfill skipped)
 * → always write.
 */
export function planTargetRevision(
  latest: LatestRevision | null,
  next: TargetSnapshot,
  today: string
): RevisionPlan {
  if (latest) {
    const unchanged =
      latest.tdee === next.tdee &&
      latest.targetCalories === next.targetCalories &&
      latest.targetProtein === next.targetProtein &&
      latest.targetCarbs === next.targetCarbs &&
      latest.targetFat === next.targetFat &&
      latest.goal === next.goal;
    if (unchanged) return { write: false };

    // "YYYY-MM-DD" strings compare correctly as plain strings.
    if (today < latest.effectiveFrom) {
      return { write: true, effectiveFrom: latest.effectiveFrom };
    }
  }
  return { write: true, effectiveFrom: today };
}

/** "YYYY-MM-DD" → the UTC-midnight Date Prisma expects for a @db.Date. */
function toDbDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * A @db.Date value (UTC-midnight Date) → "YYYY-MM-DD".
 * toISOString is correct HERE: the value is a calendar date anchored to UTC
 * midnight by the driver, not a wall-clock instant (see ai.service formatDate).
 */
function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Record a target revision if the targets actually changed.
 *
 * MUST be called inside a transaction, after the profile write. Returns
 * whether a row was written (handy for tests and logs).
 */
export async function recordTargetRevision(
  tx: Prisma.TransactionClient,
  userId: string,
  next: TargetSnapshot,
  today: string,
  source: TargetSource
): Promise<boolean> {
  const latestRow = await tx.targetRevision.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
    select: {
      effectiveFrom: true,
      tdee: true,
      targetCalories: true,
      targetProtein: true,
      targetCarbs: true,
      targetFat: true,
      goal: true,
    },
  });

  const latest: LatestRevision | null = latestRow
    ? { ...latestRow, effectiveFrom: fromDbDate(latestRow.effectiveFrom) }
    : null;

  const plan = planTargetRevision(latest, next, today);
  if (!plan.write) return false;

  const effectiveFrom = toDbDate(plan.effectiveFrom);
  await tx.targetRevision.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom } },
    update: { ...next, source },
    create: { userId, effectiveFrom, ...next, source },
  });
  return true;
}

/**
 * The targets in force on `day` ("YYYY-MM-DD"), or null when unknown — the
 * user had no recorded targets yet on that day. Callers must treat null as
 * "unknown", never substitute the current profile.
 *
 * Not used by any feature yet; long-horizon insights will read through this.
 */
export async function getTargetsOnDate(userId: string, day: string) {
  const row = await prisma.targetRevision.findFirst({
    where: { userId, effectiveFrom: { lte: toDbDate(day) } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      effectiveFrom: true,
      tdee: true,
      targetCalories: true,
      targetProtein: true,
      targetCarbs: true,
      targetFat: true,
      goal: true,
      weightKg: true,
      source: true,
    },
  });
  return row ? { ...row, effectiveFrom: fromDbDate(row.effectiveFrom) } : null;
}
