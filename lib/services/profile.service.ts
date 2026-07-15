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
import { getActiveGoal } from "@/lib/repositories/progress.repository";
import { type OnboardingFormData } from "@/lib/validators/onboarding.schema";
import { NotFoundError } from "@/lib/utils/errors";

// Onboarding Step 4 slider is in months; the engine and the Goal row work in
// days. 30 is the same approximation the Step 4 preview uses — the two must
// match exactly or the previewed plan and the saved plan diverge.
const DAYS_PER_MONTH = 30;
const DEFAULT_TIMELINE_MONTHS = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  // 2. Build the goal row when the user set a REAL target (not Maintain and
  //    not skipped). A different target weight is what makes a goal meaningful.
  const hasRealGoal =
    formData.goal !== "MAINTAIN" &&
    formData.targetWeightKg != null &&
    formData.targetWeightKg !== formData.weightKg;

  // Onboarding Step 4 sends timelineMonths; the engine works in days.
  // Keep the ×30 conversion identical to the preview's, or the number the user
  // agreed to and the number we save drift apart again.
  const timelineDays = hasRealGoal
    ? (formData.timelineMonths ?? DEFAULT_TIMELINE_MONTHS) * DAYS_PER_MONTH
    : undefined;

  // 3. Run the calorie engine.
  //    Passing targetWeightKg + timelineDays puts the engine in TIMELINE MODE,
  //    so the saved target is the same number Step 4 previewed (FIX 6).
  const calculated = calculateFullProfile({
    sex: formData.sex,
    weightKg: formData.weightKg,
    heightCm: formData.heightCm,
    age,
    activityLevel: formData.activityLevel,
    goal: formData.goal,
    dietaryType: formData.dietaryType, // Step 3: passed to tiered protein system
    targetWeightKg: hasRealGoal ? formData.targetWeightKg : undefined,
    timelineDays,
  });

  const now = new Date();
  const goalExtra = hasRealGoal
    ? {
        type: formData.goal,
        startValue: formData.weightKg,
        targetValue: formData.targetWeightKg!,
        startDate: now,
        // timelineDays → target date. Derived from the same value fed to the
        // engine above, so the deadline and the calories always agree.
        targetDate: new Date(now.getTime() + timelineDays! * MS_PER_DAY),
      }
    : undefined;

  // 4. Save to database (User + Profile + optional Goal + starting WeightLog,
  //    all in one transaction).
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
    },
    {
      goal: goalExtra,
      initialWeightKg: formData.weightKg,
    }
  );

  return {
    profile: result.profile,
    calculated,
  };
}

/**
 * Get a user's profile (with their active weight goal) or null if not found.
 * The Dashboard and Settings read `activeGoal` from here to show target weight
 * and goal progress — the Profile row holds current weight/macros, the Goal row
 * holds the target. Two sources, one response.
 */
export async function getUserProfile(userId: string) {
  const profile = await getProfileByUserId(userId);
  if (!profile) return null;
  const activeGoal = await getActiveGoal(userId);
  return { ...profile, activeGoal };
}

/**
 * Recalculate TDEE and macros when user updates their profile.
 * Called from settings page when user changes weight, activity, or goal.
 *
 * GOAL-AWARE (FIX 6): if the user has an active weight goal, recalculation
 * stays in timeline mode using the REMAINING days to their target date.
 * Without this, changing weight in Settings would silently drop the user back
 * onto the static preset (-500) and overwrite the plan onboarding built.
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
  if (!current) throw new NotFoundError("Profile not found");

  const sex = updates.sex ?? current.sex ?? "MALE";
  const weightKg = updates.weightKg ?? current.weightKg ?? 70;
  const heightCm = updates.heightCm ?? current.heightCm ?? 170;
  const age = updates.age ?? current.age ?? 25;
  const activityLevel = updates.activityLevel ?? current.activityLevel ?? "MODERATE";
  const goal = updates.goal ?? current.goal ?? "MAINTAIN";
  const dietaryType = updates.dietaryType ?? current.dietaryType ?? "NON_VEG";

  // Stay in timeline mode when an active goal exists, using the days LEFT
  // rather than the original timeline — the deadline hasn't moved just
  // because the user updated their weight.
  const activeGoal = await getActiveGoal(userId);
  const remainingDays = activeGoal?.targetDate
    ? Math.ceil((activeGoal.targetDate.getTime() - Date.now()) / MS_PER_DAY)
    : undefined;

  // A goal whose date has passed can't drive a timeline; fall back to presets
  // rather than dividing by zero or a negative.
  const useGoalTimeline =
    activeGoal != null && remainingDays != null && remainingDays > 0;

  const calculated = calculateFullProfile({
    sex,
    weightKg,
    heightCm,
    age,
    activityLevel,
    goal,
    dietaryType, // Step 3: passed to tiered protein system
    targetWeightKg: useGoalTimeline ? activeGoal.targetValue : undefined,
    timelineDays: useGoalTimeline ? remainingDays : undefined,
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
