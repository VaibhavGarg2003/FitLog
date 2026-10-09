"use client";

/**
 * Goal Progress Card — Shows progress toward target weight
 * ════════════════════════════════════════════════════════
 *
 * Three states:
 * 1. Full progress: currentWeight + targetWeight + startWeight all available
 *    → Shows progress bar toward target
 * 2. Partial: currentWeight + goal available, but no targetWeight
 *    → Shows current weight and goal type. No confusing "log your weight" message
 *    since weight came from onboarding already.
 * 3. No data: nothing available → graceful empty state
 *
 * WHY "Log your weight" was WRONG:
 * ─────────────────────────────────
 * The user enters their weight during onboarding. That weight is saved to
 * the Profile table (profile.weightKg). GoalProgress already receives it
 * via currentWeight. The old "Log your weight" message fired because
 * targetWeight (a separate field) was missing — but the user has no way
 * to set that from the app yet. Showing that message was misleading.
 *
 * CURRENT WEIGHT is the latest weigh-in (passed in by the dashboard), and
 * progress is direction-aware — see lib/progress/goal-progress.ts. Weight
 * moving away from the target is shown as such, never as progress.
 */

import { computeGoalProgress } from "@/lib/progress/goal-progress";

const GOAL_LABELS: Record<string, string> = {
  LOSE_FAT: "🔥 Lose Fat",
  GAIN_MUSCLE: "💪 Gain Muscle",
  MAINTAIN: "⚖️ Maintain Weight",
  RECOMP: "🔄 Lean Muscle (Recomp)",
};

interface GoalProgressProps {
  currentWeight: number | null;
  targetWeight: number | null;
  startWeight: number | null;
  goal?: string | null;
}

export function GoalProgress({
  currentWeight,
  targetWeight,
  startWeight,
  goal,
}: GoalProgressProps) {

  // State 3 — truly no data
  if (!currentWeight && !goal) {
    return (
      <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border h-full">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Goal
        </h3>
        <p className="text-text-muted text-sm mt-2">
          Complete onboarding to set your goal.
        </p>
      </div>
    );
  }

  // State 1 — full progress bar (all three values available)
  if (currentWeight && targetWeight && startWeight) {
    const { isMaintenance, isGaining, progressKg, movedAwayKg, percentage, remainingKg, reached } =
      computeGoalProgress(startWeight, currentWeight, targetWeight);

    // Start == target: nothing to "lose" or "gain" — show distance from target.
    if (isMaintenance) {
      return (
        <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3 h-full">
          <div className="flex justify-between items-baseline">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Goal Progress
            </h3>
            <span className="text-xs text-text-muted">
              Target: {targetWeight} kg
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">
              {reached ? "At target" : `${remainingKg.toFixed(1)} kg`}
            </span>
            {!reached && (
              <span className="text-sm text-text-muted">from target</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3 h-full">
        <div className="flex justify-between items-baseline">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Goal Progress
          </h3>
          <span className="text-xs text-text-muted">
            Target: {targetWeight} kg
          </span>
        </div>

        {movedAwayKg > 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary">
              {movedAwayKg.toFixed(1)} kg
            </span>
            <span className="text-sm text-text-muted">
              {isGaining ? "lost" : "gained"} since you started
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">
              {progressKg.toFixed(1)} kg
            </span>
            <span className="text-sm text-text-muted">
              {isGaining ? "gained" : "lost"} so far
            </span>
          </div>
        )}

        <div className="h-3 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{
              width: `${percentage}%`,
              boxShadow: "0 0 12px rgba(34, 197, 94, 0.4)",
            }}
          />
        </div>

        <div className="flex justify-between text-xs text-text-muted">
          <span>{startWeight} kg</span>
          <span className="text-primary font-medium">
            {reached ? "Goal reached 🎉" : `${remainingKg.toFixed(1)} kg to go`}
          </span>
          <span>{targetWeight} kg</span>
        </div>
      </div>
    );
  }

  // State 2 — partial info (weight from onboarding, no target set yet)
  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3 h-full">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Goal
      </h3>

      {goal && (
        <p className="text-base font-semibold text-text-primary">
          {GOAL_LABELS[goal] ?? goal}
        </p>
      )}

      {currentWeight && (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">
            {currentWeight} kg
          </span>
          <span className="text-sm text-text-muted">current weight</span>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Track daily progress in the Progress tab →
      </p>
    </div>
  );
}

