/**
 * Profile Repository — Raw Prisma Queries
 * ════════════════════════════════════════
 *
 * This is the DAO (Data Access Object) layer.
 * It contains ONLY database queries. No business logic.
 * No calorie calculations, no validation, no error messages.
 *
 * The service layer (profile.service.ts) calls these functions
 * and adds business logic on top.
 *
 * WHY SEPARATE?
 * ─────────────
 * If we ever switch from Prisma to Drizzle or raw SQL,
 * only this file changes. The service layer stays identical.
 */

import { Prisma } from "@prisma/client";
import type { FitnessGoal, Profile } from "@prisma/client";
import { prisma } from "@/lib/supabase/prisma";
import { ValidationError } from "@/lib/utils/errors";
import {
  recordTargetRevision,
  type TargetSnapshot,
} from "@/lib/repositories/target-history.repository";

/**
 * Create a User + Profile in a single database transaction.
 *
 * WHY A TRANSACTION?
 * ──────────────────
 * If user creation succeeds but profile creation fails,
 * we'd have an orphaned user with no profile.
 * A transaction ensures both succeed or both are rolled back.
 */
export async function createUserWithProfile(
  userData: {
    id: string; // From Supabase Auth — same UUID
    email: string;
    name: string | null;
    avatarUrl: string | null;
  },
  profileData: Prisma.ProfileCreateWithoutUserInput,
  extras?: {
    // A real weight goal (omitted when the user skips or picks Maintain).
    goal?: {
      type: FitnessGoal;
      startValue: number;
      targetValue: number;
      startDate: Date;
      targetDate: Date;
    };
    // Seed the onboarding-day weight so the Progress page has a starting point.
    initialWeightKg?: number;
    weightDate?: Date;
    // First entry in the user's target history. `today` is the user's
    // calendar date ("YYYY-MM-DD") in their own timezone.
    targetRevision?: { snapshot: TargetSnapshot; today: string };
  }
) {
  return prisma.$transaction(async (tx) => {
    // Upsert user (might already exist from a previous partial attempt)
    const user = await tx.user.upsert({
      where: { id: userData.id },
      update: {
        name: userData.name,
        avatarUrl: userData.avatarUrl,
      },
      create: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.avatarUrl,
      },
    });

    // Create or update profile
    const profile = await tx.profile.upsert({
      where: { userId: userData.id },
      update: {
        ...profileData,
        isOnboarded: true,
      },
      create: {
        ...profileData,
        userId: userData.id,
        isOnboarded: true,
      },
    });

    // Target history, inside this transaction so the profile and its history
    // commit together or not at all. Re-onboarding compares against the
    // existing history and only adds a row if the targets changed.
    if (extras?.targetRevision) {
      await recordTargetRevision(
        tx,
        userData.id,
        extras.targetRevision.snapshot,
        extras.targetRevision.today,
        "ONBOARDING"
      );
    }

    // Seed the starting weight (idempotent per day) so start/current weight
    // on the Progress page are populated from day one.
    if (extras?.initialWeightKg != null) {
      const date = extras.weightDate ?? new Date();
      await tx.weightLog.upsert({
        where: { userId_date: { userId: userData.id, date } },
        update: { weightKg: extras.initialWeightKg },
        create: { userId: userData.id, date, weightKg: extras.initialWeightKg },
      });
    }

    // Create the active goal. Keep the "one ACTIVE goal per user" invariant by
    // retiring any prior ACTIVE goal first (matters only on re-onboarding).
    // The partial unique index goals_one_active_per_user is the real enforcer
    // under concurrent onboarding; map P2002 to a deliberate conflict rather
    // than an unhandled 500.
    if (extras?.goal) {
      await tx.goal.updateMany({
        where: { userId: userData.id, status: "ACTIVE" },
        data: { status: "ABANDONED" },
      });
      try {
        await tx.goal.create({
          data: {
            userId: userData.id,
            type: extras.goal.type,
            startValue: extras.goal.startValue,
            targetValue: extras.goal.targetValue,
            startDate: extras.goal.startDate,
            targetDate: extras.goal.targetDate,
            status: "ACTIVE",
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ValidationError(
            "An active goal already exists for this account. Please retry."
          );
        }
        throw error;
      }
    }

    return { user, profile };
  });
}

/**
 * Get a user's profile by their Supabase Auth user ID.
 */
export async function getProfileByUserId(userId: string) {
  return prisma.profile.findUnique({
    where: { userId },
    include: { user: true },
  });
}

/**
 * Recalculate a profile's nutrition targets and record the change in target
 * history — read, calculate and write all under ONE row lock.
 *
 * WHY THE CALCULATION RUNS INSIDE THE LOCK:
 * ─────────────────────────────────────────
 * Targets are derived from the profile's own inputs (weight, activity, goal…).
 * Reading those inputs outside the transaction lets two overlapping saves
 * compute from stale values:
 *   A reads 80 kg / MODERATE and saves weight 75.
 *   B reads 80 kg / MODERATE and saves activity ACTIVE — with targets
 *     calculated for 80 kg, committed after A.
 *   Final row: 75 kg / ACTIVE, but targets (and history) for 80 kg / ACTIVE.
 * Locking the row FIRST (SELECT … FOR UPDATE) makes B wait for A to commit,
 * then read A's result, so every save calculates from the latest inputs.
 *
 * The same lock also serializes the history write: the latest-revision read
 * inside recordTargetRevision always sees the previous save's row, so a revert
 * (2,600 → 1,800) can never be skipped as "unchanged".
 *
 * WHY A CALLBACK:
 * ───────────────
 * The repository owns the transaction; the calorie maths stays in the service.
 * `compute` must be synchronous and pure — fetch anything async (like the
 * active goal) before calling, so the row lock is held for milliseconds.
 *
 * This is the only update path for profile columns that carry targets —
 * a bare update would let targets change without history.
 *
 * Returns null when the user has no profile.
 */
export async function updateProfileWithTargets(
  userId: string,
  compute: (current: Profile) => {
    data: Prisma.ProfileUpdateInput;
    revision: { snapshot: TargetSnapshot; today: string };
  }
): Promise<Profile | null> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM profiles WHERE user_id = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) return null;

    const current = await tx.profile.findUniqueOrThrow({ where: { userId } });
    const { data, revision } = compute(current);

    const profile = await tx.profile.update({ where: { userId }, data });
    await recordTargetRevision(
      tx,
      userId,
      revision.snapshot,
      revision.today,
      "PROFILE_UPDATE"
    );
    return profile;
  });
}

/**
 * Update preference-only columns. Never touches nutrition targets, so it
 * never needs a target-history row.
 *
 * updateMany (not update) so a missing profile is a count of 0 the route can
 * turn into a 404, instead of a thrown P2025.
 */
export async function updatePreferences(
  userId: string,
  data: { timezone?: string }
): Promise<boolean> {
  const res = await prisma.profile.updateMany({
    where: { userId },
    data,
  });
  return res.count > 0;
}

/**
 * Store a timezone ONLY if the account has none — atomically.
 *
 * The WHERE clause is the guarantee: two devices that both saw an empty zone,
 * or a sync that lands after a Settings save already filled it, match zero
 * rows instead of overwriting. Checking "is it null?" in the client or in a
 * separate read first would leave that race open.
 */
export async function fillTimezoneIfUnset(
  userId: string,
  timezone: string
): Promise<"filled" | "already-set" | "no-profile"> {
  const res = await prisma.profile.updateMany({
    where: { userId, timezone: null },
    data: { timezone },
  });
  if (res.count > 0) return "filled";
  const exists = await prisma.profile.count({ where: { userId } });
  return exists > 0 ? "already-set" : "no-profile";
}

/**
 * What the authenticated app shell needs on every full page load, in ONE
 * lightweight query: the onboarding guard plus the stored timezone the
 * client-side sync compares against.
 */
export async function getAppShellProfile(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { isOnboarded: true, timezone: true },
  });
  return {
    isOnboarded: profile?.isOnboarded ?? false,
    timezone: profile?.timezone ?? null,
  };
}

/**
 * Check if a user has completed onboarding.
 * Returns boolean only — lightweight query.
 */
export async function isUserOnboarded(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { isOnboarded: true },
  });
  return profile?.isOnboarded ?? false;
}
