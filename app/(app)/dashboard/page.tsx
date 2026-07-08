"use client";

/**
 * Dashboard Page — The Main Daily View
 * ═════════════════════════════════════
 *
 * This is the page every user sees every day. It assembles:
 * 1. DateStrip — horizontal date selector (reads from ui-store.ts — Step 1)
 * 2. CalorieRing — consumed vs target calories (SVG ring)
 * 3. MacroBars — protein/carbs/fat progress bars
 * 4. GoalProgress — weight loss/gain progress toward goal
 * 5. WorkoutInfo — today's burn estimate (INFO ONLY — never added to budget)
 * 6. TodayMeals — quick summary of meals logged
 *
 * DATA FLOW:
 * ──────────
 * useProfile()       → targets (targetCalories, targetProtein, etc.) — Step 2
 * useDailySummary()  → consumed (totalCalories, totalProtein, etc.) — Step 3
 * workoutSummary     → burn info (info only) — Step 3
 *
 * ALL DATA IS DATE-SCOPED:
 * Every query uses selectedDate from the UI store.
 * Changing the date in DateStrip automatically refreshes all data.
 */

import { useUIStore } from "@/stores/ui-store";
import { useProfile } from "@/lib/hooks/use-profile";
import { useDailySummary } from "@/lib/hooks/use-daily-summary";
import { DateStrip } from "./_components/date-strip";
import { CalorieRing } from "./_components/calorie-ring";
import { MacroBars } from "./_components/macro-bars";
import { GoalProgress } from "./_components/goal-progress";
import { WorkoutInfo } from "./_components/workout-info";
import { TodayMeals } from "./_components/today-meals";

export default function DashboardPage() {
  const selectedDate = useUIStore((s) => s.selectedDate);

  // Step 2 hook — reads profile with targets from engine
  const { data: profile, isLoading: profileLoading } = useProfile();

  // Step 3 hook — reads daily consumed totals
  const { data: daily, isLoading: dailyLoading } = useDailySummary(selectedDate);

  const isLoading = profileLoading || dailyLoading;

  // Extract targets from profile (calculated by engine in onboarding)
  const targets = {
    calories: profile?.targetCalories ?? 2000,
    protein: profile?.targetProtein ?? 130,
    carbs: profile?.targetCarbs ?? 250,
    fat: profile?.targetFat ?? 55,
  };

  // Extract consumed totals from daily summary
  const consumed = {
    calories: daily?.totalCalories ?? 0,
    protein: daily?.totalProtein ?? 0,
    carbs: daily?.totalCarbs ?? 0,
    fat: daily?.totalFat ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)]">
          Dashboard
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          {profile?.user?.name ? `Hey ${profile.user.name.split(" ")[0]}` : "Your daily overview"} 👋
        </p>
      </div>

      {/* Date Selector */}
      <DateStrip />

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-32"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Calorie Ring — consumed vs target */}
          <CalorieRing consumed={consumed.calories} target={targets.calories} />

          {/* Macro Bars — protein/carbs/fat */}
          <MacroBars
            consumed={{
              protein: consumed.protein,
              carbs: consumed.carbs,
              fat: consumed.fat,
            }}
            targets={{
              protein: targets.protein,
              carbs: targets.carbs,
              fat: targets.fat,
            }}
          />

          {/* Goal Progress */}
          <GoalProgress
            currentWeight={profile?.weightKg ?? null}
            targetWeight={null}
            startWeight={profile?.weightKg ?? null}
            goal={profile?.goal ?? null}
          />

          {/* Workout Info (INFO ONLY — never added to budget) */}
          <WorkoutInfo
            sessionCount={0}
            totalCaloriesLow={0}
            totalCaloriesHigh={0}
            totalMinutes={0}
          />

          {/* Today's Meals */}
          <TodayMeals meals={[]} />
        </>
      )}
    </div>
  );
}
