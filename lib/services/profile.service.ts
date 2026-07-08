/**
 * Profile Service — Business Logic Layer
 * ═══════════════════════════════════════
 *
 * This is where the calorie engine meets the database.
 *
 * FLOW:
 * ─────
 * 1. User completes onboarding form
 * 2. API route receives the raw form data
 * 3. This service:
 *    a. Validates the data (Zod)
 *    b. Calculates TDEE, target calories, macro split (Calorie Engine)
 *    c. Creates User + Profile in a single transaction (Repository)
 * 4. Returns the complete profile to the API route
 *
 * WHY A SERVICE?
 * ──────────────
 * The API route should be thin (just parse request → call service → send response).
 * All business logic lives here. This way, if we ever need to create
 * profiles from a different entry point (admin panel, import script),
 * the logic is reusable.
 */

import { calculateFullProfile } from "@/lib/engine";
import {
  createUserWithProfile,
  getProfileByUserId,
  updateProfile,
} from "@/lib/repositories/profile.repository";
import { type OnboardingFormData } from "@/lib/validators/onboarding.schema";

/**
 * Complete the onboarding process for a new user.
 *
 * Takes raw form data → calculates fitness numbers → saves everything.
 */
export async function completeOnboarding(
  supabaseUser: {
    id: string;
    email: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
      avatar_url?: string;
    };
  },
  formData: OnboardingFormData
) {
  // 1. Calculate age from date of birth
  const today = new Date();
  const birthDate = new Date(formData.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  // 2. Run the calorie engine
  const calculated = calculateFullProfile({
    sex: formData.sex,
    weightKg: formData.weightKg,
    heightCm: formData.heightCm,
    age,
    activityLevel: formData.activityLevel,
    goal: formData.goal,
    dietaryType: formData.dietaryType, // Step 3: passed to tiered protein system
  });

  // 3. Save to database (User + Profile in one transaction)
  const result = await createUserWithProfile(
    {
      id: supabaseUser.id,
      email: supabaseUser.email,
      name:
        formData.name ||
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        null,
      avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
    },
    {
      age,
      heightCm: formData.heightCm,
      weightKg: formData.weightKg,
      sex: formData.sex,
      activityLevel: formData.activityLevel,
      goal: formData.goal,
      dietaryType: formData.dietaryType,
      strictness: formData.strictness,
      unitSystem: formData.unitSystem,
      tdee: calculated.tdee,
      targetCalories: calculated.targetCalories,
      targetProtein: calculated.targetProtein,
      targetCarbs: calculated.targetCarbs,
      targetFat: calculated.targetFat,
    }
  );

  return {
    profile: result.profile,
    calculated,
  };
}

/**
 * Get a user's profile or null if not found.
 */
export async function getUserProfile(userId: string) {
  return getProfileByUserId(userId);
}

/**
 * Recalculate TDEE and macros when user updates their profile.
 * Called from settings page when user changes weight, activity, or goal.
 */
export async function recalculateProfile(
  userId: string,
  updates: {
    weightKg?: number;
    heightCm?: number;
    age?: number;
    sex?: "MALE" | "FEMALE";
    activityLevel?: "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
    goal?: "LOSE_FAT" | "GAIN_MUSCLE" | "MAINTAIN" | "RECOMP";
    dietaryType?: "VEG" | "NON_VEG" | "VEGAN" | "EGGETARIAN";
  }
) {
  // Get current profile to merge with updates
  const current = await getProfileByUserId(userId);
  if (!current) throw new Error("Profile not found");

  const sex = updates.sex ?? current.sex ?? "MALE";
  const weightKg = updates.weightKg ?? current.weightKg ?? 70;
  const heightCm = updates.heightCm ?? current.heightCm ?? 170;
  const age = updates.age ?? current.age ?? 25;
  const activityLevel = updates.activityLevel ?? current.activityLevel ?? "MODERATE";
  const goal = updates.goal ?? current.goal ?? "MAINTAIN";
  const dietaryType = updates.dietaryType ?? current.dietaryType ?? "NON_VEG";

  const calculated = calculateFullProfile({
    sex,
    weightKg,
    heightCm,
    age,
    activityLevel,
    goal,
    dietaryType, // Step 3: passed to tiered protein system
  });

  return updateProfile(userId, {
    ...updates,
    tdee: calculated.tdee,
    targetCalories: calculated.targetCalories,
    targetProtein: calculated.targetProtein,
    targetCarbs: calculated.targetCarbs,
    targetFat: calculated.targetFat,
  });
}
