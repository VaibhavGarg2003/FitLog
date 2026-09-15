/**
 * Calendar-day helpers for range aggregations
 * ═══════════════════════════════════════════
 *
 * A GROUP BY over a date range only returns days that HAVE data. Charts and
 * insights need one entry per calendar day, gaps included, in order. These
 * helpers turn "rows for some days" into "exactly one entry per day".
 *
 * All arithmetic is on UTC-anchored calendar dates, so the result never
 * depends on the timezone of the machine running it. Inputs and outputs are
 * "YYYY-MM-DD" strings — no wall-clock Date ever leaves this file.
 */

const DAY_STR = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Longest range listDays will expand — a guard against a runaway loop. */
export const MAX_RANGE_DAYS = 400;

function parseDay(day: string): number {
  if (!DAY_STR.test(day)) {
    throw new RangeError(`Invalid calendar day "${day}" (expected YYYY-MM-DD)`);
  }
  const ms = Date.parse(`${day}T00:00:00Z`);
  // Date.parse accepts "2026-02-31" and rolls it to March 3 — reject anything
  // that does not round-trip, so an impossible date fails loudly.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    throw new RangeError(`Invalid calendar day "${day}"`);
  }
  return ms;
}

/** `day` shifted by `delta` calendar days (negative goes back). */
export function addDays(day: string, delta: number): string {
  return new Date(parseDay(day) + delta * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Every calendar day from `from` to `to`, inclusive, in order.
 * Throws if the range is inverted or longer than MAX_RANGE_DAYS.
 */
export function listDays(from: string, to: string): string[] {
  const start = parseDay(from);
  const end = parseDay(to);
  if (end < start) {
    throw new RangeError(`Range end ${to} is before start ${from}`);
  }
  const count = Math.round((end - start) / MS_PER_DAY) + 1;
  if (count > MAX_RANGE_DAYS) {
    throw new RangeError(`Range of ${count} days exceeds ${MAX_RANGE_DAYS}`);
  }
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * MS_PER_DAY).toISOString().slice(0, 10)
  );
}

/**
 * One entry per day in `days`: the row for that day when present, otherwise
 * `{ date, ...empty }`. Rows dated outside `days` are ignored.
 */
export function fillDays<T extends object>(
  days: string[],
  rows: Array<T & { date: string }>,
  empty: T
): Array<T & { date: string }> {
  const byDay = new Map(rows.map((r) => [r.date, r]));
  return days.map((date) => byDay.get(date) ?? { ...empty, date });
}
