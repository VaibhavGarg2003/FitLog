/**
 * Insight Data — load one period's rows for the facts builder
 * ═══════════════════════════════════════════════════════════
 *
 * One grouped query per data type for the whole range (never one per day),
 * run in parallel: nutrition, workouts, weights, strength sets, targets.
 * The Progress page and every AI report go through here, so both always show
 * the same numbers.
 */

import {
  getDailyNutritionInRange,
  getDailyWorkoutsInRange,
  getFirstActivityDay,
  getStrengthSetsInRange,
  getWeightLogsInRange,
} from "@/lib/repositories/analytics.repository";
import { getRevisionsUpTo } from "@/lib/repositories/target-history.repository";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";
import { getActiveGoal } from "@/lib/repositories/progress.repository";
import type { FactsContext, PeriodRows } from "@/lib/insights/facts";
import { NotFoundError } from "@/lib/utils/errors";
import {
  dbDateToCalendarDay,
  isValidTimeZone,
  localDateStr,
  localDateStrInZone,
  todayForUser,
} from "@/lib/utils/local-date";

export async function loadPeriodRows(userId: string, from: string, to: string): Promise<PeriodRows> {
  const [nutrition, workouts, weights, sets, revisions] = await Promise.all([
    getDailyNutritionInRange(userId, from, to),
    getDailyWorkoutsInRange(userId, from, to),
    getWeightLogsInRange(userId, from, to),
    getStrengthSetsInRange(userId, from, to),
    getRevisionsUpTo(userId, to),
  ]);
  return { nutrition, workouts, weights, sets, revisions };
}

export interface InsightUser {
  userId: string;
  timeZone: string | null;
  /** The user's "today" in their saved zone. */
  today: string;
  /** The account's first day, on the user's calendar. */
  accountStart: string;
  insightPlan: "WEEKLY_AND_MONTHLY" | "MONTHLY_ONLY";
  ctx: FactsContext;
}

/** Everything about the user a report needs, in one place. */
export async function loadInsightUser(userId: string): Promise<InsightUser> {
  const [profile, goal] = await Promise.all([getProfileByUserId(userId), getActiveGoal(userId)]);
  if (!profile) throw new NotFoundError("Profile not found. Complete onboarding first.");

  const tz = profile.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : null;
  const accountStart = tz
    ? localDateStrInZone(tz, profile.createdAt)
    : localDateStr(profile.createdAt);

  return {
    userId,
    timeZone: tz,
    today: todayForUser(tz),
    accountStart,
    insightPlan: profile.insightPlan,
    ctx: {
      goal: goal
        ? {
            type: goal.type,
            startValue: goal.startValue,
            startDate: dbDateToCalendarDay(goal.startDate),
            targetValue: goal.targetValue,
            targetDate: dbDateToCalendarDay(goal.targetDate),
          }
        : null,
      fitnessGoal: profile.goal,
      strictness: profile.strictness,
      dietaryType: profile.dietaryType,
    },
  };
}

/** The first day with any logged data, or the account start if none. */
export async function firstDataDay(user: InsightUser): Promise<string> {
  const first = await getFirstActivityDay(user.userId);
  return first && first < user.accountStart ? first : user.accountStart;
}
