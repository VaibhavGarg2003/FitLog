/**
 * Period facts — every number a report or the Progress page shows
 * ═════════════════════════════════════════════════════════════════
 *
 * RULE: code calculates, AI only writes. This pure function turns one
 * period's raw rows into a compact facts object (~1–2 KB even for a year).
 * The Progress page draws it; the AI report is written FROM it (it never sees
 * raw logs, and every number the UI shows comes from here, not from the AI).
 *
 * Each report is built from its own facts — never from another report's AI
 * text — so a "monthly only" user's yearly report is exactly as good.
 *
 * HONEST WORDING baked into the numbers:
 * - "days with food logged", not "days on track": a day with only breakfast
 *   logged is logged, not complete. Averages are over logged days.
 * - Calorie adherence is judged against the target IN FORCE THAT DAY (target
 *   history), never today's target; days with an unknown target are skipped.
 * - Patterns describe the scale and the lifts ("weight down, strength up"),
 *   never body composition ("you built muscle") — a scale can't tell.
 */

import { addDays, daysBetween, listDays } from "@/lib/insights/fill-days";
import { periodBounds, type PeriodType } from "@/lib/insights/periods";
import { smoothedTrend, summarizeWeight, type WeightPoint } from "@/lib/insights/trend";
import { strengthDirection, topLifts, type StrengthSet } from "@/lib/insights/strength";

// ─────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────

export interface TargetRevisionLite {
  effectiveFrom: string; // "YYYY-MM-DD"
  targetCalories: number;
  targetProtein: number;
}

export interface PeriodRows {
  nutrition: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number }>;
  workouts: Array<{ date: string; sessions: number }>;
  weights: WeightPoint[];
  sets: StrengthSet[];
  /** All revisions effective on or before the period's end, ascending. */
  revisions: TargetRevisionLite[];
}

export interface FactsContext {
  /** The weight goal in force (start → target), for the pace check. */
  goal: {
    type: string;
    startValue: number;
    startDate: string;
    targetValue: number;
    targetDate: string;
  } | null;
  fitnessGoal: string | null;
  strictness: string;
  dietaryType: string | null;
}

// ─────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────

export interface BreakdownRow {
  label: string;
  start: string;
  end: string;
  foodDays: number;
  avgCalories: number | null;
  avgProtein: number | null;
  workoutDays: number;
  avgWeight: number | null;
}

export interface PeriodFacts {
  version: 1;
  period: { type: PeriodType | "RANGE"; start: string; end: string; days: number; partial: boolean };
  coverage: { foodDays: number; workoutDays: number; weighIns: number; foodDayPct: number };
  nutrition: {
    avgCalories: number | null;
    avgProtein: number | null;
    avgCarbs: number | null;
    avgFat: number | null;
    /** Targets in force during the period (from history). */
    avgTargetCalories: number | null;
    avgTargetProtein: number | null;
    daysWithKnownTarget: number;
    /** Logged days within ±10% of that day's calorie target. */
    daysOnCalorieTarget: number;
    /** Logged days reaching ≥90% of that day's protein target. */
    daysProteinHit: number;
    /** Logged days more than 10% under that day's calorie target. */
    daysUnderTarget: number;
    /** Logged days more than 10% over that day's calorie target. */
    daysOverTarget: number;
    /** Logged days more than 25% over target — cheat-day sized. */
    daysWellOverTarget: number;
    /** Σ (calories − target) on the over-target days. */
    surplusKcalOnOverDays: number;
    /** That surplus as body weight, at ~7,700 kcal per kg (an estimate). */
    estimatedKgFromOverDays: number;
  };
  training: {
    workoutDays: number;
    sessions: number;
    workingSets: number;
    /** Σ weight × reps over working sets (kg). */
    volumeKg: number;
    topLifts: Array<{ name: string; sessions: number; firstE1rm: number; lastE1rm: number; changePct: number }>;
    direction: "UP" | "FLAT" | "DOWN" | null;
    /** Workout days per 7 days of the period. */
    avgWorkoutsPerWeek: number;
    /** Full Mon–Sun weeks inside the period with no workout at all. */
    weeksWithoutWorkout: number;
    /** Longest run of consecutive days in the period without a workout. */
    longestGapDays: number;
  };
  weight: {
    start: number | null;
    end: number | null;
    change: number | null;
    ratePerWeek: number | null;
    /** Rate as % of body weight per week (flags aggressive loss > 1%). */
    ratePctBodyweight: number | null;
    plateau: boolean;
  };
  streaks: { longestFoodStreak: number; longestWorkoutWeekStreak: number };
  pattern: {
    weight: "DOWN" | "UP" | "STEADY" | "UNKNOWN";
    strength: "UP" | "FLAT" | "DOWN" | null;
  };
  goal: FactsContext["goal"];
  /** Where the user is against the goal's plan line — see goalPace(). */
  pace: GoalPace | null;
  profile: { fitnessGoal: string | null; strictness: string; dietaryType: string | null };
  breakdown: BreakdownRow[];
  previous: { avgCalories: number | null; workoutDays: number; weightChange: number | null } | null;
}

export interface GoalPace {
  /**
   * REACHED     at (or past) the target
   * AHEAD       more than 0.5 kg ahead of the straight plan line
   * ON_TRACK    within 0.5 kg of the plan line
   * BEHIND      more than 0.5 kg behind the plan line, or past the goal date
   * OFF_COURSE  the trend is moving AWAY from the target
   * MAINTAINING (maintain goal) within 1.5 kg of the target
   * DRIFTING    (maintain goal) more than 1.5 kg away
   * UNKNOWN     not enough weigh-ins in the period to tell
   */
  status: "REACHED" | "AHEAD" | "ON_TRACK" | "BEHIND" | "OFF_COURSE" | "MAINTAINING" | "DRIFTING" | "UNKNOWN";
  /** Smoothed weight at the end of the period. */
  currentKg: number | null;
  /** Where the straight line from start to target says they'd be by now. */
  expectedKg: number | null;
  /** currentKg − expectedKg, signed so that positive = behind. */
  behindKg: number | null;
  /** Still to go to the target (always ≥ 0). */
  remainingKg: number | null;
  targetDate: string;
  /** At this period's rate, the day the target would be reached. */
  projectedDate: string | null;
  /** projectedDate − targetDate in days (positive = late). */
  daysLate: number | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const KCAL_PER_KG = 7700;
/** Beyond this a projection is meaningless ("at this pace: never"). */
const MAX_PROJECTION_DAYS = 3 * 365;

/**
 * Pace against the goal, all in code: the plan is a straight line from
 * (startDate, startValue) to (targetDate, targetValue); "now" is the
 * smoothed weight at the end of the period; the projection extends this
 * period's rate. The AI only reads these values.
 */
export function goalPace(
  goal: FactsContext["goal"],
  periodEnd: string,
  trendEndKg: number | null,
  ratePerWeek: number | null,
  weighIns = 2
): GoalPace | null {
  // No goal, or one that only started after this period: nothing to judge.
  if (!goal || periodEnd < goal.startDate) return null;
  const base: GoalPace = {
    status: "UNKNOWN",
    currentKg: trendEndKg === null ? null : r1(trendEndKg),
    expectedKg: null,
    behindKg: null,
    remainingKg: null,
    targetDate: goal.targetDate,
    projectedDate: null,
    daysLate: null,
  };
  // One weigh-in is a data point, not a pace.
  if (trendEndKg === null || weighIns < 2) return base;

  const remaining = Math.abs(goal.targetValue - trendEndKg);
  base.remainingKg = r1(remaining);

  // A goal with no weight change to make is judged like maintenance.
  if (goal.type === "MAINTAIN" || goal.targetValue === goal.startValue) {
    return { ...base, status: remaining <= 1.5 ? "MAINTAINING" : "DRIFTING" };
  }

  // +1 for a gain goal, −1 for a loss goal.
  const dir = Math.sign(goal.targetValue - goal.startValue);
  const total = daysBetween(goal.startDate, goal.targetDate);
  const elapsed = Math.min(Math.max(daysBetween(goal.startDate, periodEnd), 0), Math.max(total, 0));
  const expected = total > 0 ? goal.startValue + ((goal.targetValue - goal.startValue) * elapsed) / total : goal.targetValue;
  // Positive = behind the line: above it on a loss goal, below it on a gain.
  const behind = (trendEndKg - expected) * -dir;
  base.expectedKg = r1(expected);
  base.behindKg = r1(behind);

  if ((goal.targetValue - trendEndKg) * dir <= 0) return { ...base, remainingKg: 0, status: "REACHED" };

  // Projection from this period's rate, when it points the right way.
  const towards = ratePerWeek === null ? null : ratePerWeek * dir;
  if (towards !== null && towards > 0.05) {
    const days = Math.round((remaining / towards) * 7);
    if (days <= MAX_PROJECTION_DAYS) {
      base.projectedDate = addDays(periodEnd, days);
      base.daysLate = daysBetween(goal.targetDate, base.projectedDate);
    }
  }
  // Past the goal date and not there yet is behind, however close.
  const overdue = periodEnd >= goal.targetDate;
  const status: GoalPace["status"] =
    towards !== null && towards < -0.1
      ? "OFF_COURSE"
      : overdue || behind > 0.5
        ? "BEHIND"
        : behind < -0.5
          ? "AHEAD"
          : "ON_TRACK";
  return { ...base, status };
}

/** Full Mon–Sun weeks inside [start, end] with no workout day. */
function weeksWithoutWorkout(start: string, end: string, workoutDays: Set<string>): number {
  let count = 0;
  let monday = periodBounds("WEEK", start).start;
  if (monday < start) monday = addDays(monday, 7);
  while (addDays(monday, 6) <= end) {
    const empty = listDays(monday, addDays(monday, 6)).every((d) => !workoutDays.has(d));
    if (empty) count++;
    monday = addDays(monday, 7);
  }
  return count;
}

/** Longest run of consecutive days in [start, end] with no workout. */
function longestGap(start: string, end: string, workoutDays: Set<string>): number {
  let best = 0;
  let run = 0;
  for (const d of listDays(start, end)) {
    run = workoutDays.has(d) ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r0 = (n: number | null) => (n === null ? null : Math.round(n));
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Target in force on `day`: the latest revision effective on or before it. */
export function targetOnDay(revisions: TargetRevisionLite[], day: string): TargetRevisionLite | null {
  let found: TargetRevisionLite | null = null;
  for (const r of revisions) {
    if (r.effectiveFrom <= day) found = r;
    else break;
  }
  return found;
}

/** Longest run of consecutive calendar days in a sorted list of days. */
export function longestDayStreak(days: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Longest run of consecutive Mon–Sun weeks with at least one workout. */
export function longestWeekStreak(workoutDays: string[]): number {
  const weeks = [...new Set(workoutDays.map((d) => periodBounds("WEEK", d).start))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    run = prev !== null && daysBetween(prev, w) === 7 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

/** Buckets for the breakdown: days for a week, weeks for a month, months beyond. */
function bucketsFor(start: string, end: string): Array<{ label: string; start: string; end: string }> {
  const span = daysBetween(start, end) + 1;
  if (span <= 7) return listDays(start, end).map((d) => ({ label: d, start: d, end: d }));
  const unit: PeriodType = span <= 31 ? "WEEK" : "MONTH";
  const out: Array<{ label: string; start: string; end: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const b = periodBounds(unit, cursor);
    const s = cursor;
    const e = b.end < end ? b.end : end;
    out.push({ label: unit === "WEEK" ? `week of ${s}` : s.slice(0, 7), start: s, end: e });
    cursor = addDays(e, 1);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────

export function buildFacts(
  period: { type: PeriodType | "RANGE"; start: string; end: string; partial: boolean },
  rows: PeriodRows,
  ctx: FactsContext,
  previousRows?: PeriodRows | null
): PeriodFacts {
  const inRange = (d: string) => d >= period.start && d <= period.end;
  const food = rows.nutrition.filter((n) => inRange(n.date) && n.calories > 0);
  const workoutDayList = rows.workouts.filter((w) => inRange(w.date) && w.sessions > 0);
  const weights = rows.weights.filter((w) => inRange(w.date));
  const sets = rows.sets.filter((s) => inRange(s.date));
  const days = daysBetween(period.start, period.end) + 1;

  // ── Nutrition vs the target in force each day ──
  let daysWithKnownTarget = 0;
  let daysOnCalorieTarget = 0;
  let daysProteinHit = 0;
  let daysUnderTarget = 0;
  let daysOverTarget = 0;
  let daysWellOverTarget = 0;
  let surplusKcalOnOverDays = 0;
  const targetCals: number[] = [];
  const targetProts: number[] = [];
  for (const n of food) {
    const t = targetOnDay(rows.revisions, n.date);
    if (!t) continue;
    daysWithKnownTarget++;
    targetCals.push(t.targetCalories);
    targetProts.push(t.targetProtein);
    if (t.targetCalories > 0 && Math.abs(n.calories - t.targetCalories) <= t.targetCalories * 0.1) daysOnCalorieTarget++;
    if (t.targetProtein > 0 && n.protein >= t.targetProtein * 0.9) daysProteinHit++;
    if (t.targetCalories > 0 && n.calories < t.targetCalories * 0.9) daysUnderTarget++;
    if (t.targetCalories > 0 && n.calories > t.targetCalories * 1.1) {
      daysOverTarget++;
      surplusKcalOnOverDays += n.calories - t.targetCalories;
      if (n.calories > t.targetCalories * 1.25) daysWellOverTarget++;
    }
  }

  // ── Training ──
  const lifts = topLifts(sets);
  const direction = strengthDirection(lifts);
  const volumeKg = Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0));
  const workoutSet = new Set(workoutDayList.map((x) => x.date));

  // ── Weight ──
  const w = summarizeWeight(weights);
  const ratePctBodyweight =
    w?.ratePerWeek != null && w.end > 0 ? Math.round((w.ratePerWeek / w.end) * 1000) / 10 : null;
  const weightPattern: PeriodFacts["pattern"]["weight"] = !w
    ? "UNKNOWN"
    : w.ratePerWeek !== null
      ? w.ratePerWeek <= -0.1 ? "DOWN" : w.ratePerWeek >= 0.1 ? "UP" : "STEADY"
      : w.change <= -0.5 ? "DOWN" : w.change >= 0.5 ? "UP" : "STEADY";

  // ── Pace against the goal (smoothed end weight, this period's rate) ──
  const trendPoints = smoothedTrend(weights);
  const pace = goalPace(
    ctx.goal,
    period.end,
    trendPoints.length ? trendPoints[trendPoints.length - 1].trendKg : null,
    w?.ratePerWeek ?? null,
    weights.length
  );

  // ── Breakdown ──
  const breakdown: BreakdownRow[] = bucketsFor(period.start, period.end).map((b) => {
    const within = (d: string) => d >= b.start && d <= b.end;
    const f = food.filter((n) => within(n.date));
    const ws = weights.filter((x) => within(x.date));
    return {
      label: b.label,
      start: b.start,
      end: b.end,
      foodDays: f.length,
      avgCalories: r0(avg(f.map((n) => n.calories))),
      avgProtein: r0(avg(f.map((n) => n.protein))),
      workoutDays: workoutDayList.filter((x) => within(x.date)).length,
      avgWeight: r1(avg(ws.map((x) => x.weightKg))),
    };
  });

  // ── Previous period (for "vs last month") ──
  let previous: PeriodFacts["previous"] = null;
  if (previousRows) {
    const pf = previousRows.nutrition.filter((n) => n.calories > 0);
    const pw = summarizeWeight(previousRows.weights);
    previous = {
      avgCalories: r0(avg(pf.map((n) => n.calories))),
      workoutDays: previousRows.workouts.filter((x) => x.sessions > 0).length,
      weightChange: pw?.change ?? null,
    };
  }

  return {
    version: 1,
    period: { type: period.type, start: period.start, end: period.end, days, partial: period.partial },
    coverage: {
      foodDays: food.length,
      workoutDays: workoutDayList.length,
      weighIns: weights.length,
      foodDayPct: Math.round((food.length / days) * 100),
    },
    nutrition: {
      avgCalories: r0(avg(food.map((n) => n.calories))),
      avgProtein: r0(avg(food.map((n) => n.protein))),
      avgCarbs: r0(avg(food.map((n) => n.carbs))),
      avgFat: r0(avg(food.map((n) => n.fat))),
      avgTargetCalories: r0(avg(targetCals)),
      avgTargetProtein: r0(avg(targetProts)),
      daysWithKnownTarget,
      daysOnCalorieTarget,
      daysProteinHit,
      daysUnderTarget,
      daysOverTarget,
      daysWellOverTarget,
      surplusKcalOnOverDays: Math.round(surplusKcalOnOverDays),
      estimatedKgFromOverDays: r1(surplusKcalOnOverDays / KCAL_PER_KG) ?? 0,
    },
    training: {
      workoutDays: workoutDayList.length,
      sessions: workoutDayList.reduce((s, x) => s + x.sessions, 0),
      workingSets: sets.length,
      volumeKg,
      topLifts: lifts.map((l) => ({
        name: l.name,
        sessions: l.sessions,
        firstE1rm: l.first.e1rm,
        lastE1rm: l.last.e1rm,
        changePct: l.changePct,
      })),
      direction,
      avgWorkoutsPerWeek: r1((workoutDayList.length / days) * 7) ?? 0,
      weeksWithoutWorkout: weeksWithoutWorkout(period.start, period.end, workoutSet),
      longestGapDays: longestGap(period.start, period.end, workoutSet),
    },
    weight: {
      start: w?.start ?? null,
      end: w?.end ?? null,
      change: w?.change ?? null,
      ratePerWeek: w?.ratePerWeek ?? null,
      ratePctBodyweight,
      plateau: w?.plateau ?? false,
    },
    streaks: {
      longestFoodStreak: longestDayStreak(food.map((n) => n.date)),
      longestWorkoutWeekStreak: longestWeekStreak(workoutDayList.map((x) => x.date)),
    },
    pattern: { weight: weightPattern, strength: direction },
    goal: ctx.goal,
    pace,
    profile: { fitnessGoal: ctx.fitnessGoal, strictness: ctx.strictness, dietaryType: ctx.dietaryType },
    breakdown,
    previous,
  };
}

/** The rows of `rows` that fall within [from, to] (revisions are kept whole). */
export function sliceRows(rows: PeriodRows, from: string, to: string): PeriodRows {
  const within = (d: string) => d >= from && d <= to;
  return {
    nutrition: rows.nutrition.filter((n) => within(n.date)),
    workouts: rows.workouts.filter((w) => within(w.date)),
    weights: rows.weights.filter((w) => within(w.date)),
    sets: rows.sets.filter((s) => within(s.date)),
    revisions: rows.revisions,
  };
}

/**
 * The data-derived part of a period's facts, as a stable string. A report
 * whose stored fingerprint differs from today's was written before the user
 * edited something in that period — it is "outdated". Goal and profile
 * context are left out on purpose: changing your goal later doesn't make
 * last month's numbers wrong. `previous` is left out too (it is only prompt
 * context and is not recomputed when a report is displayed).
 */
export function factsFingerprintSource(f: PeriodFacts): string {
  return JSON.stringify({
    period: f.period,
    coverage: f.coverage,
    nutrition: f.nutrition,
    training: f.training,
    weight: f.weight,
    streaks: f.streaks,
    breakdown: f.breakdown,
    // A new or changed goal changes the timeline coaching → Outdated.
    goal: f.goal,
  });
}
