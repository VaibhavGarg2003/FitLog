/**
 * Report periods — which week / month / quarter / year, and is it reportable?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure calendar logic on "YYYY-MM-DD" strings (the user's calendar, from the
 * saved time zone). No Date objects cross this boundary, so nothing here can
 * shift with a server's or device's clock.
 *
 * RULES (agreed with the owner):
 * - Reports cover FINISHED periods only: last week (Mon–Sun), last month…
 *   A "weekly" report generated on a Monday used to describe one day plus
 *   six empty ones; a finished period can't.
 * - A brand-new user's first week is never reported partially (the free,
 *   non-AI "first week" card covers it). Longer periods may be PARTIAL when
 *   the account started inside them, if enough of the period was covered:
 *   a month needs 14 days, a quarter 45, a year 90.
 * - Enough DATA is also required (evidence thresholds below): an empty month
 *   gets "log a few more days", not an AI essay about nothing.
 */

import { addDays, daysBetween } from "@/lib/insights/fill-days";
import { calendarDayToDbDate } from "@/lib/utils/local-date";

export type PeriodType = "WEEK" | "MONTH" | "QUARTER" | "YEAR";
export const PERIOD_TYPES: PeriodType[] = ["WEEK", "MONTH", "QUARTER", "YEAR"];

export interface Period {
  type: PeriodType;
  /** First day covered ("YYYY-MM-DD"). For a partial period, the account's first day. */
  start: string;
  /** Last day covered. */
  end: string;
  /** Calendar start of the full period (the report's identity). */
  periodStart: string;
  /** True when the account started inside the period. */
  partial: boolean;
  /** Days covered, inclusive. */
  days: number;
}

/** Minimum days of account life a partial period must cover to be reported. */
export const MIN_PARTIAL_DAYS: Record<PeriodType, number | null> = {
  WEEK: null, // never partial — the first-week card covers it
  MONTH: 14,
  QUARTER: 45,
  YEAR: 90,
};

/**
 * Minimum logged evidence: EITHER this many days with food logged OR this
 * many days with a workout. Either kind of consistent logging is worth
 * reviewing; neither is not.
 */
export const MIN_EVIDENCE: Record<PeriodType, { foodDays: number; workoutDays: number }> = {
  WEEK: { foodDays: 3, workoutDays: 2 },
  MONTH: { foodDays: 7, workoutDays: 4 },
  QUARTER: { foodDays: 20, workoutDays: 10 },
  YEAR: { foodDays: 40, workoutDays: 20 },
};

function parts(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new RangeError(`Invalid calendar day "${day}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Last day of `month` (1–12) in `year`, as "YYYY-MM-DD". */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 of next month
  return `${year}-${pad(month)}-${pad(d.getUTCDate())}`;
}

/** The calendar period of `type` that contains `day`. Weeks run Monday–Sunday. */
export function periodBounds(type: PeriodType, day: string): { start: string; end: string } {
  const [y, m] = parts(day);
  switch (type) {
    case "WEEK": {
      const dow = calendarDayToDbDate(day).getUTCDay(); // 0 = Sunday
      const start = addDays(day, -((dow + 6) % 7));
      return { start, end: addDays(start, 6) };
    }
    case "MONTH":
      return { start: `${y}-${pad(m)}-01`, end: lastDayOfMonth(y, m) };
    case "QUARTER": {
      const first = Math.floor((m - 1) / 3) * 3 + 1;
      return { start: `${y}-${pad(first)}-01`, end: lastDayOfMonth(y, first + 2) };
    }
    case "YEAR":
      return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
}

/** The most recent period of `type` that has fully ended before `today`. */
export function lastFinishedBounds(type: PeriodType, today: string) {
  return periodBounds(type, addDays(periodBounds(type, today).start, -1));
}

/**
 * The reportable version of a finished period for an account that started on
 * `accountStart`, or null when it can't be reported (account too new).
 */
export function reportablePeriod(
  type: PeriodType,
  bounds: { start: string; end: string },
  accountStart: string
): Period | null {
  if (accountStart > bounds.end) return null;
  if (accountStart <= bounds.start) {
    return {
      type,
      start: bounds.start,
      end: bounds.end,
      periodStart: bounds.start,
      partial: false,
      days: daysBetween(bounds.start, bounds.end) + 1,
    };
  }
  const minDays = MIN_PARTIAL_DAYS[type];
  const covered = daysBetween(accountStart, bounds.end) + 1;
  if (minDays === null || covered < minDays) return null;
  return {
    type,
    start: accountStart,
    end: bounds.end,
    periodStart: bounds.start,
    partial: true,
    days: covered,
  };
}

/** The period's report for `today`: the last finished one, if reportable. */
export function lastReportablePeriod(
  type: PeriodType,
  today: string,
  accountStart: string
): Period | null {
  return reportablePeriod(type, lastFinishedBounds(type, today), accountStart);
}

/** True when the logged evidence is enough for a report of this type. */
export function hasEnoughEvidence(
  type: PeriodType,
  coverage: { foodDays: number; workoutDays: number }
): boolean {
  const min = MIN_EVIDENCE[type];
  return coverage.foodDays >= min.foodDays || coverage.workoutDays >= min.workoutDays;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Short label: "21–27 Sep 2026", "September 2026", "16–30 Sep 2026", "Q3 2026", "2026". */
export function periodLabel(p: Pick<Period, "type" | "start" | "end" | "partial">): string {
  const [sy, sm, sd] = parts(p.start);
  const [ey, em, ed] = parts(p.end);
  const range = () =>
    p.start === p.end
      ? `${sd} ${MONTHS[sm - 1]} ${sy}`
      : sy === ey && sm === em
      ? `${sd}–${ed} ${MONTHS[em - 1]} ${ey}`
      : sy === ey
        ? `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`
        : `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  switch (p.type) {
    case "WEEK":
      return range();
    case "MONTH":
      return p.partial ? range() : `${MONTHS_LONG[em - 1]} ${ey}`;
    case "QUARTER":
      return p.partial ? range() : `Q${Math.floor((em - 1) / 3) + 1} ${ey}`;
    case "YEAR":
      return p.partial ? range() : String(ey);
  }
}
