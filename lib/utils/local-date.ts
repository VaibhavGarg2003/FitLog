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

// ─────────────────────────────────────────────────────────────
// TIMEZONE-AWARE DATES (server side)
// ─────────────────────────────────────────────────────────────
// localDateStr() uses the timezone of whatever machine runs it. In the
// browser that is the user's zone; on Vercel it is UTC. The helpers below let
// the SERVER compute a user's calendar date from their stored IANA zone.

/**
 * Shape of an IANA zone name: "UTC", "Asia/Kolkata", "Etc/GMT+5",
 * "America/Argentina/Buenos_Aires". Deliberately rejects raw offsets like
 * "+05:30" — Intl accepts those, but an offset has no DST rules, so storing
 * one would silently drift by an hour twice a year.
 */
const IANA_ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * True if `tz` is a timezone this runtime can actually format dates in.
 *
 * WHY NOT Intl.supportedValuesOf("timeZone")? That list holds canonical names
 * only, but browsers still REPORT legacy aliases — Chrome in India says
 * "Asia/Calcutta", which is valid and absent from the list. Constructing a
 * formatter is the check that matches what we later do with the value.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  if (!IANA_ZONE_SHAPE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * "YYYY-MM-DD" for `date` as seen on a wall clock in `timeZone`.
 *
 * Example: 2026-09-30T19:00:00Z is still Sept 30 in UTC but already
 * 00:30 on Oct 1 in Asia/Kolkata → "2026-10-01".
 *
 * formatToParts (not format) so the output never depends on a locale's
 * separator or field order. Throws RangeError on an invalid zone — validate
 * untrusted input with isValidTimeZone() first.
 */
export function localDateStrInZone(
  timeZone: string,
  date: Date = new Date()
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const field = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)!.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}

/**
 * The user's calendar date, best effort, on the server.
 *
 * Stored zone when we have a valid one; otherwise the runtime's local date
 * (UTC on Vercel — off by at most one day, only for accounts whose zone has
 * not synced yet).
 */
export function todayForUser(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone)
    ? localDateStrInZone(timeZone)
    : localDateStr();
}

/**
 * The zone this device reports, or undefined if the runtime can't say.
 * Browser-side use: onboarding submit and the timezone sync.
 */
export function deviceTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : undefined;
  } catch {
    return undefined;
  }
}
