import { describe, it, expect } from "vitest";
import {
  hasEnoughEvidence,
  lastFinishedBounds,
  lastReportablePeriod,
  periodBounds,
  periodLabel,
  reportablePeriod,
} from "@/lib/insights/periods";

describe("periodBounds", () => {
  it("weeks run Monday–Sunday", () => {
    expect(periodBounds("WEEK", "2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" }); // Mon
    expect(periodBounds("WEEK", "2026-10-04")).toEqual({ start: "2026-09-28", end: "2026-10-04" }); // Sun
    expect(periodBounds("WEEK", "2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
  });

  it("months, quarters and years use calendar boundaries (leap years included)", () => {
    expect(periodBounds("MONTH", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(periodBounds("MONTH", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodBounds("QUARTER", "2026-08-15")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(periodBounds("QUARTER", "2026-12-31")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodBounds("YEAR", "2026-06-01")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("lastFinishedBounds", () => {
  it("never includes today — a Monday reports the week that just ended", () => {
    expect(lastFinishedBounds("WEEK", "2026-09-28")).toEqual({ start: "2026-09-21", end: "2026-09-27" });
    expect(lastFinishedBounds("MONTH", "2026-10-01")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(lastFinishedBounds("MONTH", "2026-01-15")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(lastFinishedBounds("QUARTER", "2026-10-01")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(lastFinishedBounds("YEAR", "2027-01-01")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("reportablePeriod", () => {
  const sept = { start: "2026-09-01", end: "2026-09-30" };

  it("a period the account fully covers is reported whole", () => {
    expect(reportablePeriod("MONTH", sept, "2026-07-10")).toMatchObject({ partial: false, start: "2026-09-01", days: 30 });
  });

  it("a first month is reported from signup when ≥14 days were covered", () => {
    const p = reportablePeriod("MONTH", sept, "2026-09-16");
    expect(p).toMatchObject({ partial: true, start: "2026-09-16", end: "2026-09-30", periodStart: "2026-09-01", days: 15 });
    expect(reportablePeriod("MONTH", sept, "2026-09-17")).toMatchObject({ days: 14 });
    expect(reportablePeriod("MONTH", sept, "2026-09-18")).toBeNull(); // 13 days
  });

  it("never reports a partial week, or a period before the account existed", () => {
    expect(reportablePeriod("WEEK", { start: "2026-09-21", end: "2026-09-27" }, "2026-09-22")).toBeNull();
    expect(reportablePeriod("MONTH", sept, "2026-10-02")).toBeNull();
  });

  it("partial quarters and years need 45 and 90 days", () => {
    expect(reportablePeriod("QUARTER", { start: "2026-07-01", end: "2026-09-30" }, "2026-08-17")).toMatchObject({ days: 45 });
    expect(reportablePeriod("QUARTER", { start: "2026-07-01", end: "2026-09-30" }, "2026-08-18")).toBeNull();
    expect(reportablePeriod("YEAR", { start: "2026-01-01", end: "2026-12-31" }, "2026-10-03")).toMatchObject({ days: 90 });
    expect(reportablePeriod("YEAR", { start: "2026-01-01", end: "2026-12-31" }, "2026-10-04")).toBeNull();
  });

  it("lastReportablePeriod combines both rules", () => {
    expect(lastReportablePeriod("MONTH", "2026-10-05", "2026-09-10")).toMatchObject({ partial: true, days: 21 });
    expect(lastReportablePeriod("WEEK", "2026-09-23", "2026-09-22")).toBeNull();
  });
});

describe("hasEnoughEvidence", () => {
  it("needs food OR workout consistency", () => {
    expect(hasEnoughEvidence("WEEK", { foodDays: 3, workoutDays: 0 })).toBe(true);
    expect(hasEnoughEvidence("WEEK", { foodDays: 0, workoutDays: 2 })).toBe(true);
    expect(hasEnoughEvidence("WEEK", { foodDays: 2, workoutDays: 1 })).toBe(false);
    expect(hasEnoughEvidence("MONTH", { foodDays: 6, workoutDays: 3 })).toBe(false);
  });
});

describe("periodLabel", () => {
  it("reads naturally", () => {
    expect(periodLabel({ type: "WEEK", start: "2026-09-21", end: "2026-09-27", partial: false })).toBe("21–27 Sep 2026");
    expect(periodLabel({ type: "WEEK", start: "2026-09-28", end: "2026-10-04", partial: false })).toBe("28 Sep – 4 Oct 2026");
    expect(periodLabel({ type: "MONTH", start: "2026-09-01", end: "2026-09-30", partial: false })).toBe("September 2026");
    expect(periodLabel({ type: "MONTH", start: "2026-09-16", end: "2026-09-30", partial: true })).toBe("16–30 Sep 2026");
    expect(periodLabel({ type: "QUARTER", start: "2026-07-01", end: "2026-09-30", partial: false })).toBe("Q3 2026");
    expect(periodLabel({ type: "YEAR", start: "2026-01-01", end: "2026-12-31", partial: false })).toBe("2026");
    expect(periodLabel({ type: "WEEK", start: "2026-09-21", end: "2026-09-21", partial: true })).toBe("21 Sep 2026");
  });
});
