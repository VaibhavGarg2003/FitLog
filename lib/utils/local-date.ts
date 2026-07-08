/**
 * Local Date String Utility
 * ─────────────────────────
 * Returns a date as "YYYY-MM-DD" using the USER'S LOCAL TIMEZONE,
 * not UTC.
 *
 * WHY NOT toISOString()?
 * ──────────────────────
 * new Date().toISOString() always formats in UTC, not the user's local time.
 *
 * BUG this fixes:
 * At midnight IST (UTC+5:30), e.g. 00:06 IST on July 8:
 *   → new Date().toISOString()             → "2026-07-07T18:36:00Z" ❌ (UTC = July 7!)
 *   → new Date().toISOString().split("T")[0] → "2026-07-07"         ❌
 *   → localDateStr()                          → "2026-07-08"         ✅ (IST = July 8)
 *
 * This caused workouts logged on July 7 IST to show up when "today" (July 8)
 * was selected, and food logged via AI to disappear after refetch.
 *
 * CORRECT approach: getFullYear/getMonth/getDate always return LOCAL values.
 *
 * USAGE:
 *   import { localDateStr } from "@/lib/utils/local-date";
 *   const today = localDateStr();               // "2026-07-08"
 *   const yesterday = localDateStr(someDate);    // "2026-07-07"
 */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
