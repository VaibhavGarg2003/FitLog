/**
 * Calendar-day expansion for range queries — a GROUP BY returns only days
 * with data; insights need every day, in order, gaps included.
 */

import { describe, it, expect } from "vitest";
import { addDays, fillDays, listDays, MAX_RANGE_DAYS } from "@/lib/insights/fill-days";

describe("listDays", () => {
  it("lists an inclusive week", () => {
    expect(listDays("2026-10-05", "2026-10-11")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("returns one day when from === to", () => {
    expect(listDays("2026-10-05", "2026-10-05")).toEqual(["2026-10-05"]);
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(listDays("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(listDays("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("rejects inverted ranges", () => {
    expect(() => listDays("2026-10-11", "2026-10-05")).toThrow(RangeError);
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => listDays("2026-10-5", "2026-10-11")).toThrow(RangeError);
    expect(() => listDays("2026-02-31", "2026-03-02")).toThrow(RangeError);
  });

  it("refuses ranges longer than the cap", () => {
    const from = "2026-01-01";
    expect(listDays(from, addDays(from, MAX_RANGE_DAYS - 1))).toHaveLength(MAX_RANGE_DAYS);
    expect(() => listDays(from, addDays(from, MAX_RANGE_DAYS))).toThrow(RangeError);
  });
});

describe("addDays", () => {
  it("moves forward and backward across boundaries", () => {
    expect(addDays("2026-10-05", 6)).toBe("2026-10-11");
    expect(addDays("2026-10-11", -13)).toBe("2026-09-28");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("fillDays", () => {
  const days = ["2026-10-05", "2026-10-06", "2026-10-07"];

  it("fills missing days with the empty value, keeping order", () => {
    const rows = [{ date: "2026-10-06", sessions: 2 }];
    expect(fillDays(days, rows, { sessions: 0 })).toEqual([
      { date: "2026-10-05", sessions: 0 },
      { date: "2026-10-06", sessions: 2 },
      { date: "2026-10-07", sessions: 0 },
    ]);
  });

  it("ignores rows outside the requested days", () => {
    const rows = [
      { date: "2026-10-04", sessions: 9 },
      { date: "2026-10-07", sessions: 1 },
    ];
    expect(fillDays(days, rows, { sessions: 0 }).map((d) => d.sessions)).toEqual([0, 0, 1]);
  });

  it("does not share one mutable empty object between days", () => {
    const filled = fillDays(days, [], { calories: 0 });
    filled[0].calories = 500;
    expect(filled[1].calories).toBe(0);
  });
});
