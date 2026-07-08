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
import type { Prisma } from "@prisma/client";

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
  profileData: Prisma.ProfileCreateWithoutUserInput
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
