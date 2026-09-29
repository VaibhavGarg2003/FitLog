/**
 * Progress Summary — the numbers behind the Progress page's range tabs
 * ═════════════════════════════════════════════════════════════════════
 *
 * 1M / 3M / 6M / 1Y / All → one facts object (same builder as the AI
 * reports) plus the series the charts draw. No AI, no limits: it is a few
 * grouped queries and some arithmetic.
 */

import { addDays } from "@/lib/insights/fill-days";
import { buildFacts, type PeriodFacts } from "@/lib/insights/facts";
import { smoothedTrend } from "@/lib/insights/trend";
import { topLifts } from "@/lib/insights/strength";
import { listDays, MAX_RANGE_DAYS } from "@/lib/insights/fill-days";
import { firstDataDay, loadInsightUser, loadPeriodRows } from "@/lib/services/insight-data.service";

export const RANGES = ["1M", "3M", "6M", "1Y", "ALL"] as const;
export type SummaryRange = (typeof RANGES)[number];

const RANGE_DAYS: Record<Exclude<SummaryRange, "ALL">, number> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
};

export interface ProgressSummary {
  range: SummaryRange;
  from: string;
  to: string;
  /** "All" reaches further back than the window allows (≈13 months). */
  capped: boolean;
  facts: PeriodFacts;
  series: {
    weight: Array<{ date: string; kg: number; trendKg: number }>;
    days: Array<{ date: string; food: boolean; workout: boolean }>;
    lifts: Array<{ name: string; sessions: number; changePct: number; series: Array<{ date: string; e1rm: number }> }>;
  };
}

export async function getProgressSummary(userId: string, range: SummaryRange): Promise<ProgressSummary> {
  const user = await loadInsightUser(userId);
  const to = user.today;
  // The longest window the day-list helper allows (just over a year).
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1));
  let from =
    range === "ALL" ? await firstDataDay(user) : addDays(to, -(RANGE_DAYS[range] - 1));
  const capped = from < earliest;
  if (capped) from = earliest;
  if (from > to) from = to;

  const rows = await loadPeriodRows(userId, from, to);
  const facts = buildFacts({ type: "RANGE", start: from, end: to, partial: false }, rows, user.ctx);

  const foodDays = new Set(rows.nutrition.filter((n) => n.calories > 0).map((n) => n.date));
  const workoutDays = new Set(rows.workouts.filter((w) => w.sessions > 0).map((w) => w.date));

  return {
    range,
    from,
    to,
    capped,
    facts,
    series: {
      weight: smoothedTrend(rows.weights).map((p) => ({ date: p.date, kg: p.weightKg, trendKg: p.trendKg })),
      days: listDays(from, to).map((date) => ({
        date,
        food: foodDays.has(date),
        workout: workoutDays.has(date),
      })),
      lifts: topLifts(rows.sets).map((l) => ({
        name: l.name,
        sessions: l.sessions,
        changePct: l.changePct,
        series: l.series,
      })),
    },
  };
}
