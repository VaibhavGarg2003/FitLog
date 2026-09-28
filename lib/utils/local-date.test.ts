/**
 * Timezone-aware calendar dates — the server must be able to tell what DAY it
 * is for the user, from their stored zone, without trusting its own clock.
 */

import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  localDateStrInZone,
  todayForUser,
  localDateStr,
  ageOn,
  calendarDayToDbDate,
  dbDateToCalendarDay,
  canonicalTimeZone,
  sameTimeZone,
  timeZoneLabel,
  listTimeZones,
  weekdayShort,
} from "@/lib/utils/local-date";

describe("ageOn", () => {
  it("counts whole years, turning a year older ON the birthday", () => {
    expect(ageOn("1998-05-10", "2026-05-09")).toBe(27);
    expect(ageOn("1998-05-10", "2026-05-10")).toBe(28);
    expect(ageOn("1998-05-10", "2026-12-31")).toBe(28);
  });

  it("uses the USER'S day — the server's UTC day can be a day behind", () => {
    // 00:30 on the birthday in India is still the day before in UTC.
    const instant = new Date("2026-05-09T19:00:00Z");
    expect(ageOn("1998-05-10", localDateStrInZone("Asia/Kolkata", instant))).toBe(28);
    expect(ageOn("1998-05-10", localDateStrInZone("UTC", instant))).toBe(27);
  });

  it("does not shift the birthday for zones west of UTC", () => {
    // new Date("1998-05-10").getDate() is 9 in Los Angeles; this must not care.
    const instant = new Date("2026-05-10T18:00:00Z"); // 11:00 May 10 in LA
    expect(ageOn("1998-05-10", localDateStrInZone("America/Los_Angeles", instant))).toBe(28);
  });

  it("counts a Feb 29 birthday from Mar 1 in non-leap years", () => {
    expect(ageOn("2000-02-29", "2027-02-28")).toBe(26);
    expect(ageOn("2000-02-29", "2027-03-01")).toBe(27);
    expect(ageOn("2000-02-29", "2028-02-29")).toBe(28);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(() => ageOn("10/05/1998", "2026-05-10")).toThrow(RangeError);
  });
});

describe("calendar day ↔ @db.Date", () => {
  it("round-trips a calendar day through the UTC-midnight Date Prisma uses", () => {
    const d = calendarDayToDbDate("2026-10-01");
    expect(d.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(dbDateToCalendarDay(d)).toBe("2026-10-01");
  });
});

describe("isValidTimeZone", () => {
  it("accepts canonical IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Etc/GMT+5")).toBe(true);
  });

  it("accepts legacy aliases browsers still report", () => {
    // Chrome in India reports this, not Asia/Kolkata.
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true);
  });

  it("rejects raw offsets — they carry no DST rules", () => {
    expect(isValidTimeZone("+05:30")).toBe(false);
    expect(isValidTimeZone("-0800")).toBe(false);
  });

  it("rejects unknown names, empty, oversized and non-strings", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("A/" + "b".repeat(70))).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("rejects injection-shaped strings", () => {
    expect(isValidTimeZone("Asia/Kolkata'; DROP TABLE users;--")).toBe(false);
    expect(isValidTimeZone("../../etc/passwd")).toBe(false);
  });
});

describe("localDateStrInZone", () => {
  it("rolls to the next day east of UTC — the midnight IST case", () => {
    // 19:00 UTC Sept 30 = 00:30 IST Oct 1.
    const instant = new Date("2026-09-30T19:00:00Z");
    expect(localDateStrInZone("UTC", instant)).toBe("2026-09-30");
    expect(localDateStrInZone("Asia/Kolkata", instant)).toBe("2026-10-01");
  });

  it("stays on the previous day west of UTC", () => {
    // 03:00 UTC Oct 1 = 20:00 PDT Sept 30.
    const instant = new Date("2026-10-01T03:00:00Z");
    expect(localDateStrInZone("America/Los_Angeles", instant)).toBe("2026-09-30");
  });

  it("handles year boundaries", () => {
    const instant = new Date("2026-12-31T20:00:00Z");
    expect(localDateStrInZone("Asia/Tokyo", instant)).toBe("2027-01-01");
  });

  it("zero-pads month and day", () => {
    const instant = new Date("2026-03-05T12:00:00Z");
    expect(localDateStrInZone("UTC", instant)).toBe("2026-03-05");
  });
});

describe("todayForUser", () => {
  it("uses the stored zone when valid", () => {
    expect(todayForUser("Asia/Kolkata")).toBe(localDateStrInZone("Asia/Kolkata"));
  });

  it("falls back to the runtime's local date when missing or invalid", () => {
    expect(todayForUser(null)).toBe(localDateStr());
    expect(todayForUser(undefined)).toBe(localDateStr());
    expect(todayForUser("Not/AZone")).toBe(localDateStr());
  });
});

describe("canonicalTimeZone / sameTimeZone", () => {
  it("treats renamed zones as the same place, whichever spelling a runtime reports", () => {
    expect(canonicalTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(sameTimeZone("Asia/Calcutta", "Asia/Kolkata")).toBe(true);
    expect(sameTimeZone("Europe/Kiev", "Europe/Kyiv")).toBe(true);
    expect(sameTimeZone("Asia/Saigon", "Asia/Ho_Chi_Minh")).toBe(true);
  });

  it("folds runtime aliases", () => {
    expect(sameTimeZone("US/Eastern", "America/New_York")).toBe(true);
    expect(sameTimeZone("Etc/UTC", "UTC")).toBe(true);
  });

  it("never equates different places, even with the same offset today", () => {
    // London and Lagos share UTC+1 in summer and differ in winter.
    expect(sameTimeZone("Europe/London", "Africa/Lagos")).toBe(false);
    expect(sameTimeZone("Asia/Kolkata", "Asia/Colombo")).toBe(false);
  });
});

describe("timeZoneLabel", () => {
  it("shows the current city name and the offset", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    expect(timeZoneLabel("Asia/Calcutta", winter)).toBe("Kolkata · GMT+5:30");
    expect(timeZoneLabel("America/Los_Angeles", winter)).toBe("Los Angeles · GMT-8");
  });
});

describe("listTimeZones", () => {
  it("lists each place once and always includes the requested zones", () => {
    const zones = listTimeZones(["Asia/Calcutta", "Asia/Kolkata"]);
    const india = zones.filter((z) => sameTimeZone(z, "Asia/Kolkata"));
    expect(india).toHaveLength(1);
    expect(zones.length).toBeGreaterThan(300);
    expect(zones).toContain("Europe/London");
  });

  it("skips invalid names", () => {
    expect(listTimeZones(["Not/AZone", null, undefined]).includes("Not/AZone")).toBe(false);
  });
});

describe("weekdayShort", () => {
  it("names the calendar day itself, not the device's view of it", () => {
    expect(weekdayShort("2026-09-28")).toBe("Mon");
    expect(weekdayShort("2026-10-04")).toBe("Sun");
    expect(weekdayShort("2028-02-29")).toBe("Tue");
  });
});

describe("listTimeZones — UTC", () => {
  it("always offers UTC, which supportedValuesOf() leaves out", () => {
    expect(listTimeZones()).toContain("UTC");
  });
});
