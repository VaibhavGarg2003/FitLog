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
 * LAYOUT (laptop):
 * 12-column grid — hero calorie + macros on top, goal/workout mid row,
 * meals full-width bottom so the wide canvas feels filled.
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
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`bg-surface rounded-2xl p-6 border border-border animate-pulse h-36 lg:h-44 ${
                i <= 2 ? "lg:col-span-6" : i === 3 ? "lg:col-span-6" : "lg:col-span-6"
              }`}
            />
          ))}
        </div>
      ) : (
        // Phone: single column. Laptop: 12-col regions so the wide shell is used.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-start">
          {/* Calorie Ring — hero left */}
          <div className="lg:col-span-5">
            <CalorieRing consumed={consumed.calories} target={targets.calories} />
          </div>

          {/* Macro Bars — roomy right */}
          <div className="lg:col-span-7">
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
          </div>

          {/* Goal Progress */}
          <div className="lg:col-span-6">
            <GoalProgress
              currentWeight={profile?.weightKg ?? null}
              targetWeight={profile?.activeGoal?.targetValue ?? null}
              startWeight={
                profile?.activeGoal?.startValue ?? profile?.weightKg ?? null
              }
              goal={profile?.goal ?? null}
            />
          </div>

          {/* Workout Info (INFO ONLY — never added to budget) */}
          <div className="lg:col-span-6">
            <WorkoutInfo
              sessionCount={0}
              totalCaloriesLow={0}
              totalCaloriesHigh={0}
              totalMinutes={0}
            />
          </div>

          {/* Today's Meals — full width on laptop */}
          <div className="lg:col-span-12">
            <TodayMeals meals={[]} />
          </div>
        </div>
      )}
    </div>
  );
}
