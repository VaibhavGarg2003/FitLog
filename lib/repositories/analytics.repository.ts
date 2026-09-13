/**
 * Analytics Repository — one query per data type for a whole date range
 * ═════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * ────────────────
 * The weekly insight used to ask the database one question PER DAY per data
 * type (7 days × nutrition + 7 days × workouts = 14 round trips). That grows
 * with the range: a month would be ~60, a year ~730. These functions ask ONCE
 * per data type and let Postgres group by day.
 *
 * DATE HANDLING (same rule as workout.repository.ts):
 * ───────────────────────────────────────────────────
 * Range bounds are bound as TEXT and cast with ::date; days come back as text
 * via to_char. No JS Date crosses the boundary in either direction, so the
 * result cannot shift with the database session's or the server's timezone.
 *
 * Days with no data are simply absent from the result — callers fill the gaps
 * (lib/insights/fill-days.ts).
 *
 * INDEXES USED:
 * ─────────────
 * meal_entries(user_id, date), meal_foods(meal_entry_id),
 * workout_sessions(user_id, date), exercise_sets(session_id),
 * weight_logs(user_id, date) [unique].
 */

import { prisma } from "@/lib/supabase/prisma";

export interface DailyNutrition {
  date: string; // "YYYY-MM-DD"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Summed calories and macros for each day in [from, to] that has logged food.
 *
 * Totals are rounded to whole numbers, matching getDailySummary(), so the
 * insight sees the same numbers the dashboard shows.
 */
export async function getDailyNutritionInRange(
  userId: string,
  from: string,
  to: string
): Promise<DailyNutrition[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      date: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>
  >`
    SELECT to_char(me.date, 'YYYY-MM-DD') AS date,
           SUM(mf.calories)::float8       AS calories,
           SUM(mf.protein)::float8        AS protein,
           SUM(mf.carbs)::float8          AS carbs,
           SUM(mf.fat)::float8            AS fat
    FROM meal_entries me
    JOIN meal_foods mf ON mf.meal_entry_id = me.id
    WHERE me.user_id = ${userId}
      AND me.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY me.date
    ORDER BY me.date
  `;

  return rows.map((r) => ({
    date: r.date,
    calories: Math.round(r.calories),
    protein: Math.round(r.protein),
    carbs: Math.round(r.carbs),
    fat: Math.round(r.fat),
  }));
}

export interface DailyWorkouts {
  date: string; // "YYYY-MM-DD"
  sessions: number;
}

/**
 * Number of workouts that count as training, for each day in [from, to].
 *
 * WHAT COUNTS AS A WORKOUT:
 * ─────────────────────────
 *   • COMPLETED sessions — always.
 *   • IN_PROGRESS sessions — only if at least one set was logged. An
 *     unfinished session with sets is real training the user may still come
 *     back to (see getSessionsByDate), but an empty one started by accident is
 *     not a workout.
 *   • CANCELLED — never: it means the user discarded it.
 *
 * The old per-day path counted every non-cancelled session, empty ones
 * included, which inflated the weekly workout count.
 */
export async function getDailyWorkoutsInRange(
  userId: string,
  from: string,
  to: string
): Promise<DailyWorkouts[]> {
  return prisma.$queryRaw<DailyWorkouts[]>`
    SELECT to_char(ws.date, 'YYYY-MM-DD') AS date,
           COUNT(*)::int                  AS sessions
    FROM workout_sessions ws
    WHERE ws.user_id = ${userId}
      AND ws.date BETWEEN ${from}::date AND ${to}::date
      AND (
        ws.status = 'COMPLETED'
        OR (
          ws.status = 'IN_PROGRESS'
          AND EXISTS (SELECT 1 FROM exercise_sets es WHERE es.session_id = ws.id)
        )
      )
    GROUP BY ws.date
    ORDER BY ws.date
  `;
}

export interface WeightEntry {
  date: string; // "YYYY-MM-DD"
  weightKg: number;
}

/**
 * Weight entries dated within [from, to], oldest first.
 *
 * Bounded by DATE, unlike getWeightHistory(userId, n), which returns the
 * latest n ENTRIES — "14 entries" can span months for someone who weighs in
 * weekly, and ignores the period being analysed entirely.
 */
export async function getWeightLogsInRange(
  userId: string,
  from: string,
  to: string
): Promise<WeightEntry[]> {
  return prisma.$queryRaw<WeightEntry[]>`
    SELECT to_char(wl.date, 'YYYY-MM-DD') AS date,
           wl.weight_kg                    AS "weightKg"
    FROM weight_logs wl
    WHERE wl.user_id = ${userId}
      AND wl.date BETWEEN ${from}::date AND ${to}::date
    ORDER BY wl.date
  `;
}
