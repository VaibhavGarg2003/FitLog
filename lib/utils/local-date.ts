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

// ─────────────────────────────────────────────────────────────
// CALENDAR DAYS ↔ @db.Date COLUMNS
// ─────────────────────────────────────────────────────────────
// Prisma reads and writes a @db.Date column as a JS Date at UTC midnight.
// These two helpers are the only sanctioned way across that boundary, so a
// user's calendar day ("2026-10-01") is stored as exactly that day — never as
// whatever day the server's clock or timezone happens to produce.

/** "YYYY-MM-DD" → the UTC-midnight Date Prisma expects for a @db.Date. */
export function calendarDayToDbDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * A @db.Date value (UTC-midnight Date) → "YYYY-MM-DD".
 * toISOString is correct HERE: the value is a calendar date the driver
 * anchored to UTC midnight, not a wall-clock instant.
 */
export function dbDateToCalendarDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Whole years of age on `today`, for someone born on `dateOfBirth`.
 * Both are "YYYY-MM-DD" calendar days — pure integer math, no Date objects.
 *
 * WHY NOT new Date(dateOfBirth).getDate()? "1998-05-10" parses as UTC
 * midnight, so in any zone west of UTC getDate() returns the 9th, and on the
 * server "today" is the UTC day, not the user's. Either shift moves the
 * birthday by a day, and someone is a year younger for that day.
 *
 * A Feb 29 birthday counts from Mar 1 in non-leap years.
 */
export function ageOn(dateOfBirth: string, today: string): number {
  const dob = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  const now = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!dob || !now) {
    throw new RangeError(`ageOn expects YYYY-MM-DD, got "${dateOfBirth}" / "${today}"`);
  }
  const [by, bm, bd] = dob.slice(1).map(Number);
  const [ty, tm, td] = now.slice(1).map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

// ─────────────────────────────────────────────────────────────
// COMPARING AND NAMING ZONES
// ─────────────────────────────────────────────────────────────

/**
 * Renamed IANA zones: legacy name → current name. Runtimes disagree on which
 * one they report — Node/ICU says "Asia/Calcutta", recent Chrome says
 * "Asia/Kolkata" — so every comparison goes through this table, or an Indian
 * user would be told their time zone "changed" when it did not.
 */
const RENAMED_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Asia/Macao": "Asia/Macau",
  "Asia/Chungking": "Asia/Chongqing",
  "Asia/Ujung_Pandang": "Asia/Makassar",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "Europe/Zaporozhye": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Africa/Asmera": "Africa/Asmara",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  "GMT": "UTC",
};

/**
 * One stable name per real zone, so two spellings of the same place compare
 * equal. The runtime folds most aliases ("US/Eastern" → "America/New_York");
 * RENAMED_ZONES then settles the renames runtimes disagree about. Different
 * places stay different even when their clocks currently agree (never compare
 * by UTC offset: London and Lagos match in winter, not in summer).
 */
export function canonicalTimeZone(tz: string): string {
  let resolved = tz;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    // Unknown to this runtime — compare the raw name.
  }
  return RENAMED_ZONES[resolved] ?? resolved;
}

/** True when two zone names mean the same place. */
export function sameTimeZone(a: string, b: string): boolean {
  return a === b || canonicalTimeZone(a) === canonicalTimeZone(b);
}

/**
 * "Kolkata · GMT+5:30" — city from the current name plus today's offset.
 * The offset is display only; it moves with DST.
 */
export function timeZoneLabel(tz: string, now: Date = new Date()): string {
  const name = canonicalTimeZone(tz);
  const city = (name.split("/").pop() ?? name).replace(/_/g, " ");
  let offset = "";
  try {
    offset =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    // Offset is decoration; a zone this runtime can't format just omits it.
  }
  return offset ? `${city} · ${offset}` : city;
}

/**
 * Every zone this runtime knows, one entry per real place, sorted by name,
 * always including `alsoInclude` (a stored or detected zone the runtime's list
 * may spell differently).
 */
export function listTimeZones(alsoInclude: Array<string | null | undefined> = []): string[] {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf(key: "timeZone"): string[] })
      .supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  const seen = new Set<string>();
  const zones: string[] = [];
  // "UTC" is valid everywhere but absent from supportedValuesOf() in every
  // current runtime — seed it so it can be chosen deliberately.
  for (const tz of ["UTC", ...all, ...alsoInclude]) {
    if (!tz || !isValidTimeZone(tz)) continue;
    const key = canonicalTimeZone(tz);
    if (seen.has(key)) continue;
    seen.add(key);
    // Store the current spelling when this runtime accepts it.
    zones.push(isValidTimeZone(key) ? key : tz);
  }
  return zones.sort((a, b) => a.localeCompare(b));
}

/**
 * Short weekday ("Mon") for a "YYYY-MM-DD" calendar day. Computed on the
 * UTC-anchored date with timeZone "UTC", so it names THAT calendar day no
 * matter where the device is.
 */
export function weekdayShort(day: string): string {
  return calendarDayToDbDate(day).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
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
