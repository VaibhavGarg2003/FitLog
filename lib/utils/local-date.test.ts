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
} from "@/lib/utils/local-date";

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
