"use client";

/**
 * Workout Info Card — Today's workout burn summary (INFO ONLY)
 * ════════════════════════════════════════════════════════════
 *
 * CRITICAL RULE (from Step 2 audit):
 * This card displays workout calorie burn for INFORMATION ONLY.
 * These calories are NEVER added to the daily calorie budget.
 * The TDEE already includes gym activity via the activity multiplier.
 *
 * Shows as a range: "~320–380 kcal burned" to be honest about uncertainty.
 */

interface WorkoutInfoProps {
  sessionCount: number;
  totalCaloriesLow: number;
  totalCaloriesHigh: number;
  totalMinutes: number;
}

export function WorkoutInfo({
  sessionCount,
  totalCaloriesLow,
  totalCaloriesHigh,
  totalMinutes,
}: WorkoutInfoProps) {
  if (sessionCount === 0) {
    return (
      <div className="bg-surface rounded-2xl p-5 border border-border">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Workout
        </h3>
        <p className="text-text-muted text-sm mt-2">
          No workout logged today. Hit the gym! 💪
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-5 border border-border space-y-2">
      <div className="flex justify-between items-baseline">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Workout
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          Info only
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-text-primary">
          ~{totalCaloriesLow}–{totalCaloriesHigh}
        </span>
        <span className="text-sm text-text-muted">kcal burned</span>
      </div>

      <div className="flex gap-4 text-sm text-text-muted">
        <span>🏋️ {sessionCount} session{sessionCount > 1 ? "s" : ""}</span>
        <span>⏱️ {totalMinutes} min</span>
      </div>

      <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
        These calories are NOT added to your budget. Your daily target already
        accounts for gym activity.
      </p>
    </div>
  );
}
