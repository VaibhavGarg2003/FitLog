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
 *
 * DATES: every calendar date this file writes — onboarding day, goal start
 * and deadline, the starting weigh-in, the target-history row — is the
 * USER'S calendar day (todayForUser), never the server's UTC day. Vercel runs
 * in UTC: at 00:30 in India it is still yesterday there.
 */

import type { FitnessGoal, Goal, Profile } from "@prisma/client";
import { calculateFullProfile } from "@/lib/engine";
import {
  createUserWithProfile,
  getProfileByUserId,
  updateProfileWithTargets,
} from "@/lib/repositories/profile.repository";
import {
  getActiveGoal,
  replaceActiveGoal,
  retireActiveGoals,
} from "@/lib/repositories/progress.repository";
import { type OnboardingFormData } from "@/lib/validators/onboarding.schema";
import { NotFoundError } from "@/lib/utils/errors";
import {
  ageOn,
  calendarDayToDbDate,
  dbDateToCalendarDay,
  isValidTimeZone,
  todayForUser,
} from "@/lib/utils/local-date";
import { addDays, daysBetween } from "@/lib/insights/fill-days";

// Onboarding Step 4 slider is in months; the engine and the Goal row work in
// days. 30 is the same approximation the Step 4 preview uses — the two must
// match exactly or the previewed plan and the saved plan diverge.
const DAYS_PER_MONTH = 30;
const DEFAULT_TIMELINE_MONTHS = 4;

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
  formData: OnboardingFormData,
  // Detected by the browser, validated by the route. Absent when the browser
  // could not report one — the in-app sync fills it in later.
  options: { timezone?: string } = {}
) {
  // The user's calendar day, once, for EVERY date below — age, goal dates,
  // the starting weigh-in and the first target-history row all agree.
  // (Server date only when the browser could not report a zone.)
  const today = todayForUser(options.timezone);

  // 1. Age from date of birth, on the user's day — the same calendar math the
  //    Step 4 preview uses, so the previewed plan and the saved plan match.
  const age = ageOn(formData.dateOfBirth, today);

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

  const goalExtra = hasRealGoal
    ? {
        type: formData.goal,
        startValue: formData.weightKg,
        targetValue: formData.targetWeightKg!,
        startDate: calendarDayToDbDate(today),
        // timelineDays → target date. Derived from the same value fed to the
        // engine above, so the deadline and the calories always agree.
        targetDate: calendarDayToDbDate(addDays(today, timelineDays!)),
      }
    : undefined;

  // 4. Save to database (User + Profile + optional Goal + starting WeightLog,
  //    all in one transaction).
  // Name is collected in onboarding Step 1 (not at signup). Prefer that value;
  // OAuth providers may still supply a fallback via user_metadata.
  const result = await createUserWithProfile(
    {
      id: supabaseUser.id,
      email: supabaseUser.email,
      name:
        formData.name?.trim() ||
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
      insightPlan: formData.insightPlan,
      // undefined (not null) when unknown, so re-onboarding never wipes a
      // zone that was already synced.
      timezone: options.timezone,
      tdee: calculated.tdee,
      targetCalories: calculated.targetCalories,
      targetProtein: calculated.targetProtein,
      targetCarbs: calculated.targetCarbs,
      targetFat: calculated.targetFat,
    },
    {
      goal: goalExtra,
      initialWeightKg: formData.weightKg,
      weightDate: calendarDayToDbDate(today),
      // The first row of the user's target history, dated on THEIR calendar.
      targetRevision: {
        snapshot: {
          tdee: calculated.tdee,
          targetCalories: calculated.targetCalories,
          targetProtein: calculated.targetProtein,
          targetCarbs: calculated.targetCarbs,
          targetFat: calculated.targetFat,
          goal: formData.goal,
          weightKg: formData.weightKg,
        },
        today,
      },
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

// ─────────────────────────────────────────────────────────────
// TARGET RECALCULATION
// ─────────────────────────────────────────────────────────────

type ProfileUpdates = {
  weightKg?: number;
  heightCm?: number;
  age?: number;
  sex?: "MALE" | "FEMALE";
  activityLevel?: "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
  goal?: "LOSE_FAT" | "GAIN_MUSCLE" | "MAINTAIN" | "RECOMP";
  dietaryType?: "VEG" | "NON_VEG" | "VEGAN" | "EGGETARIAN";
};

/**
 * The user's calendar day inside a locked recalculation: the stored zone
 * first; a valid device zone only when none is stored (and then it is also
 * saved — see `establishZone`); the server date only when neither exists.
 */
function lockedToday(current: Profile, deviceTimeZone: string | undefined) {
  const establishZone =
    current.timezone == null && isValidTimeZone(deviceTimeZone)
      ? deviceTimeZone
      : undefined;
  return {
    today: todayForUser(current.timezone ?? establishZone),
    establishZone,
  };
}

/**
 * Pure: the profile write + history row for a recalculation, from the LOCKED
 * profile and the goal active after any goal change in the same transaction.
 *
 * GOAL-AWARE (FIX 6): with an active goal, the engine stays in timeline mode
 * using the calendar days LEFT until the goal's deadline — changing weight in
 * Settings must not drop the user back onto the static preset (-500) and
 * overwrite the plan they chose. A deadline that has passed can't drive a
 * timeline; that falls back to presets.
 */
function buildRecalculation(
  current: Profile,
  activeGoal: Goal | null,
  updates: ProfileUpdates,
  deviceTimeZone: string | undefined
) {
  const { today, establishZone } = lockedToday(current, deviceTimeZone);

  const sex = updates.sex ?? current.sex ?? "MALE";
  const weightKg = updates.weightKg ?? current.weightKg ?? 70;
  const heightCm = updates.heightCm ?? current.heightCm ?? 170;
  const age = updates.age ?? current.age ?? 25;
  const activityLevel = updates.activityLevel ?? current.activityLevel ?? "MODERATE";
  const goal = updates.goal ?? current.goal ?? "MAINTAIN";
  const dietaryType = updates.dietaryType ?? current.dietaryType ?? "NON_VEG";

  // Whole calendar days from the user's today to the deadline day — not a
  // fraction that depends on what time the server ran.
  const remainingDays = activeGoal
    ? daysBetween(today, dbDateToCalendarDay(activeGoal.targetDate))
    : undefined;
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

  return {
    data: {
      ...updates,
      ...(establishZone ? { timezone: establishZone } : {}),
      tdee: calculated.tdee,
      targetCalories: calculated.targetCalories,
      targetProtein: calculated.targetProtein,
      targetCarbs: calculated.targetCarbs,
      targetFat: calculated.targetFat,
    },
    // The repository writes a history row only when the targets actually
    // changed, so a save that leaves them untouched adds nothing.
    revision: {
      snapshot: {
        tdee: calculated.tdee,
        targetCalories: calculated.targetCalories,
        targetProtein: calculated.targetProtein,
        targetCarbs: calculated.targetCarbs,
        targetFat: calculated.targetFat,
        goal,
        weightKg,
      },
      today,
    },
  };
}

/**
 * Recalculate TDEE and macros when user updates their profile.
 * Called from settings page when user changes weight, activity, or goal.
 *
 * CONCURRENCY: the profile AND the active goal are read, merged and
 * recalculated INSIDE the repository's row lock (see
 * updateProfileWithTargets), so two overlapping saves — or a save racing a
 * goal change — can never compute targets from stale inputs.
 *
 * TIMEZONE: `options.deviceTimeZone` is the zone the browser reports with the
 * save. It is used only when the account has no stored zone yet — then it
 * dates the history row correctly AND is saved in the same transaction. This
 * closes the gap where a save lands before the background timezone sync. A
 * stored zone always wins; changing it is a deliberate act, not a side effect.
 */
export async function recalculateProfile(
  userId: string,
  updates: ProfileUpdates,
  options: { deviceTimeZone?: string } = {}
) {
  const result = await updateProfileWithTargets(userId, (current, activeGoal) =>
    buildRecalculation(current, activeGoal, updates, options.deviceTimeZone)
  );
  if (!result) throw new NotFoundError("Profile not found");
  return result.profile;
}

// ─────────────────────────────────────────────────────────────
// WEIGHT GOALS
// ─────────────────────────────────────────────────────────────
// A goal's target weight and deadline are calorie-engine inputs, so a goal
// change IS a target change. Both operations below write the goal and the
// recalculated targets (+ history row) in ONE transaction under the profile
// lock. Before this, a goal change left the old goal's calories in force until
// the user happened to press "Recalculate" in Settings — and target history
// recorded nothing at all.

/**
 * Set (create or replace) the user's active weight goal, then recalculate.
 * Start and deadline are the user's calendar days; the deadline is
 * `timelineMonths` × 30 days out, the same approximation onboarding uses.
 */
export async function setWeightGoal(
  userId: string,
  input: {
    type: FitnessGoal;
    startValue: number;
    targetValue: number;
    timelineMonths: number;
  },
  options: { deviceTimeZone?: string } = {}
) {
  const result = await updateProfileWithTargets(
    userId,
    (current, activeGoal) =>
      buildRecalculation(current, activeGoal, {}, options.deviceTimeZone),
    (tx, current) => {
      const { today } = lockedToday(current, options.deviceTimeZone);
      return replaceActiveGoal(tx, userId, {
        type: input.type,
        startValue: input.startValue,
        targetValue: input.targetValue,
        startDate: calendarDayToDbDate(today),
        targetDate: calendarDayToDbDate(
          addDays(today, input.timelineMonths * DAYS_PER_MONTH)
        ),
      });
    }
  );
  if (!result || !result.mutation) throw new NotFoundError("Profile not found");
  return { goal: result.mutation, profile: result.profile };
}

/**
 * Remove the user's active weight goal (retired, not deleted), then
 * recalculate — without a goal the engine falls back to the preset for the
 * user's fitness goal. Returns how many goals were retired.
 */
export async function removeWeightGoal(
  userId: string,
  options: { deviceTimeZone?: string } = {}
) {
  const result = await updateProfileWithTargets(
    userId,
    (current, activeGoal) =>
      buildRecalculation(current, activeGoal, {}, options.deviceTimeZone),
    (tx) => retireActiveGoals(tx, userId)
  );
  if (!result) throw new NotFoundError("Profile not found");
  return { removed: result.mutation ?? 0, profile: result.profile };
}
