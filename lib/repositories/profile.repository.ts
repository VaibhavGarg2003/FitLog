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

import { prisma } from "@/lib/supabase/prisma";
import type { Prisma, FitnessGoal } from "@prisma/client";

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
    if (extras?.goal) {
      await tx.goal.updateMany({
        where: { userId: userData.id, status: "ACTIVE" },
        data: { status: "ABANDONED" },
      });
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
 * Update an existing profile.
 */
export async function updateProfile(
  userId: string,
  data: Prisma.ProfileUpdateInput
) {
  return prisma.profile.update({
    where: { userId },
    data,
  });
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
