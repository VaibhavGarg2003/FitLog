/**
 * Goal progress — direction-aware maths for the dashboard goal card
 * ═════════════════════════════════════════════════════════════════
 *
 * Pure: start, current and target weights in, display numbers out.
 *
 * WHY DIRECTION MATTERS:
 * The card used Math.abs(start - current) as "progress", which counted weight
 * moving the WRONG way as progress — a fat-loss user who gained 1 kg was shown
 * "1.0 kg lost". Progress here is signed toward the target; movement away from
 * it is reported separately and never fills the bar.
 */

export interface GoalProgress {
  /** Start and target are equal: there is no direction, only distance. */
  isMaintenance: boolean;
  /** Target is above the start weight. */
  isGaining: boolean;
  /** kg moved toward the target (0 when moved away). */
  progressKg: number;
  /** kg moved away from the target since the start (0 when on track). */
  movedAwayKg: number;
  /** 0–100: share of the start→target distance covered. */
  percentage: number;
  /** kg still to go (0 once reached or passed). */
  remainingKg: number;
  /** Current weight is at or past the target. */
  reached: boolean;
}

export function computeGoalProgress(
  startKg: number,
  currentKg: number,
  targetKg: number
): GoalProgress {
  const isGaining = targetKg > startKg;
  const total = Math.abs(targetKg - startKg);

  // Equal endpoints: any movement is "away", in either direction. Without
  // this, 70 → 69 with target 70 read as "1.0 kg lost so far, 0.0 to go".
  if (total === 0) {
    const off = Math.abs(currentKg - targetKg);
    return {
      isMaintenance: true,
      isGaining: false,
      progressKg: 0,
      movedAwayKg: off,
      percentage: 0,
      remainingKg: off,
      reached: off === 0,
    };
  }

  // Positive = toward the target, negative = away from it.
  const towardTarget = isGaining ? currentKg - startKg : startKg - currentKg;
  const remainingRaw = isGaining ? targetKg - currentKg : currentKg - targetKg;

  const progressKg = Math.max(0, towardTarget);

  return {
    isMaintenance: false,
    isGaining,
    progressKg,
    movedAwayKg: Math.max(0, -towardTarget),
    percentage: Math.min(100, (progressKg / total) * 100),
    remainingKg: Math.max(0, remainingRaw),
    reached: remainingRaw <= 0,
  };
}

/**
 * The weight the goal card should treat as CURRENT.
 *
 * Normally the newest weigh-in. But a weigh-in dated BEFORE the active goal
 * started belongs to an earlier goal: counting it would show progress (or
 * regress) on a goal that began after it. Then the goal's own start weight is
 * the honest "current" — no progress yet. Without a goal or any weigh-in, the
 * profile weight is the fallback.
 *
 * Dates are "YYYY-MM-DD" (or ISO strings starting with one), compared as text.
 */
export function pickCurrentWeight(input: {
  latestWeighIn: { weightKg: number; date: string } | null | undefined;
  profileWeightKg: number | null | undefined;
  goal: { startDate: string; startValue: number } | null | undefined;
}): number | null {
  const { latestWeighIn, profileWeightKg, goal } = input;
  if (latestWeighIn && goal && latestWeighIn.date.slice(0, 10) < goal.startDate.slice(0, 10)) {
    return goal.startValue;
  }
  return latestWeighIn?.weightKg ?? profileWeightKg ?? null;
}
