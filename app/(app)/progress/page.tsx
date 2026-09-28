"use client";

/**
 * Progress Page — your transformation over time
 * ══════════════════════════════════════════════
 *
 * Top to bottom:
 * 1. Log today's weight + all-time stats (start, current, change)
 * 2. Range tabs (1M / 3M / 6M / 1Y / All) with the numbers for that range:
 *    weight trend chart, strength progress, consistency grid
 *    — computed by code, instant, no AI (GET /api/progress/summary)
 * 3. AI coach: weekly report (plan permitting), monthly review, quarterly and
 *    yearly reviews, the free first-week card, and past reports
 *    (GET /api/insights; the AI only runs on "Write my review")
 * 4. Recent workouts + the adaptive-TDEE notice
 *
 * LAYOUT (laptop): 12-col grid; charts and reports span the width.
 */

import { useProgressData } from "@/lib/hooks/use-progress";
import { WeightLogInput } from "./_components/weight-log-input";
import { StatsCards } from "./_components/stats-cards";
import { ProgressOverview } from "./_components/progress-overview";
import { AIReports } from "./_components/ai-reports";

export default function ProgressPage() {
  const { data: progress, isLoading } = useProgressData();

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
          Progress
        </h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Track your body transformation
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-start">
        {/* Weight Log Input */}
        <div className="lg:col-span-4">
          <WeightLogInput />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="lg:col-span-8 space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-surface rounded-2xl p-6 border border-border animate-pulse h-24"
              />
            ))}
          </div>
        )}

        {progress && (
          <>
            {/* All-time stats */}
            <div className="lg:col-span-8">
              <StatsCards
                startWeight={progress.startWeight}
                currentWeight={progress.currentWeight}
                totalChange={progress.totalChange}
                logCount={progress.logCount}
                canUseAdaptiveTDEE={progress.canUseAdaptiveTDEE}
              />
            </div>

            {/* Range tabs + trend, strength, consistency (no AI) */}
            <div className="lg:col-span-12">
              <ProgressOverview targetWeight={progress.activeGoal?.targetValue} />
            </div>

            {/* AI coach reports */}
            <div className="lg:col-span-12">
              <AIReports />
            </div>

            {/* Recent Workouts — last 7 days, refreshed when a session is
                finished (finish mutation invalidates the progress cache) */}
            <div className="lg:col-span-12">
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <p className="px-4 lg:px-5 pt-4 pb-2 text-sm font-semibold text-text-secondary uppercase tracking-wider">
                  Recent Workouts{" "}
                  <span className="normal-case font-normal text-text-muted">
                    · last 7 days
                  </span>
                </p>
                {progress.recentWorkouts?.length ? (
                  <div className="divide-y divide-border">
                    {progress.recentWorkouts.map((w) => (
                      <div
                        key={w.id}
                        className="p-3 px-4 lg:px-5 flex items-center gap-3"
                      >
                        <span className="text-base leading-none">🏋️</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-text-primary truncate">
                            {w.exercises.length > 0
                              ? w.exercises.join(", ")
                              : "Workout"}
                          </span>
                          <span className="block text-xs text-text-muted">
                            {new Date(w.date).toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            })}
                            {" · "}
                            {w.totalSets} set{w.totalSets !== 1 ? "s" : ""}
                            {w.durationMin ? ` · ${w.durationMin} min` : ""}
                            {w.caloriesBurnedLow && w.caloriesBurnedHigh
                              ? ` · ≈${w.caloriesBurnedLow}–${w.caloriesBurnedHigh} kcal`
                              : ""}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 lg:px-5 pb-4 text-sm text-text-muted">
                    No workouts in the last 7 days — log one from the Workout
                    tab and it will show up here.
                  </p>
                )}
              </div>
            </div>

            {/* Adaptive TDEE Notice */}
            {progress.canUseAdaptiveTDEE && (
              <div className="lg:col-span-12">
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 lg:p-5">
                  <p className="text-sm font-semibold text-primary">
                    ✨ Adaptive TDEE Available
                  </p>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    You have {progress.logCount} weight logs. The engine can now
                    calculate your real TDEE from actual data — more accurate than
                    any formula.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
