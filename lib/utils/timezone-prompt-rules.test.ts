/**
 * When the app offers "switch to this device's time zone".
 */

import { describe, it, expect } from "vitest";
import {
  KEEP_FOR_MS,
  isKeepActive,
  keepKey,
  shouldPromptTimezone,
} from "@/lib/utils/timezone-prompt-rules";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const base = { saved: "Asia/Kolkata", device: "America/Toronto", online: true, keptAt: null, now: NOW };

describe("shouldPromptTimezone", () => {
  it("prompts when the device is in a different place", () => {
    expect(shouldPromptTimezone(base)).toBe(true);
  });

  it("never prompts for two spellings of the same place", () => {
    expect(shouldPromptTimezone({ ...base, device: "Asia/Calcutta" })).toBe(false);
    expect(shouldPromptTimezone({ ...base, device: "Asia/Kolkata" })).toBe(false);
  });

  it("stays quiet with nothing saved, no device zone, or offline", () => {
    expect(shouldPromptTimezone({ ...base, saved: null })).toBe(false);
    expect(shouldPromptTimezone({ ...base, device: undefined })).toBe(false);
    expect(shouldPromptTimezone({ ...base, online: false })).toBe(false);
  });

  it("respects a recent Keep, and asks again once it has expired", () => {
    expect(shouldPromptTimezone({ ...base, keptAt: NOW - 1000 })).toBe(false);
    expect(shouldPromptTimezone({ ...base, keptAt: NOW - KEEP_FOR_MS + 60_000 })).toBe(false);
    // A tab left open past 14 days: the in-memory answer must expire too.
    expect(shouldPromptTimezone({ ...base, keptAt: NOW - KEEP_FOR_MS })).toBe(true);
    expect(shouldPromptTimezone({ ...base, keptAt: NOW - 30 * 24 * 3600_000 })).toBe(true);
  });
});

describe("isKeepActive", () => {
  it("rejects missing or garbage timestamps", () => {
    expect(isKeepActive(null, NOW)).toBe(false);
    expect(isKeepActive(undefined, NOW)).toBe(false);
    expect(isKeepActive(Number.NaN, NOW)).toBe(false);
    expect(isKeepActive(0, NOW)).toBe(false);
  });
});

describe("keepKey", () => {
  it("is per account, per saved zone and per device zone — aliases share one", () => {
    const k = keepKey("u1", "Asia/Kolkata", "America/Toronto");
    expect(keepKey("u1", "Asia/Calcutta", "America/Toronto")).toBe(k);
    expect(keepKey("u2", "Asia/Kolkata", "America/Toronto")).not.toBe(k);
    expect(keepKey("u1", "Europe/London", "America/Toronto")).not.toBe(k);
    expect(keepKey("u1", "Asia/Kolkata", "Europe/Paris")).not.toBe(k);
  });
});
