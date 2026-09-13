/**
 * Target history planning — when a target change gets a history row, and
 * which day it is dated.
 *
 * The transaction around it (profile write first, then the latest-revision
 * read, then the upsert) needs a live Postgres and is not exercised here.
 * planTargetRevision is the part that decides what gets written, so it is pure
 * and tested directly — same approach as workout-import.test.ts.
 */

import { describe, it, expect } from "vitest";
import {
  planTargetRevision,
  type LatestRevision,
  type TargetSnapshot,
} from "@/lib/repositories/target-history.repository";

const CUT: TargetSnapshot = {
  tdee: 2400,
  targetCalories: 1800,
  targetProtein: 140,
  targetCarbs: 180,
  targetFat: 55,
  goal: "LOSE_FAT",
  weightKg: 84,
};

function latestFrom(snapshot: TargetSnapshot, effectiveFrom: string): LatestRevision {
  return {
    effectiveFrom,
    tdee: snapshot.tdee,
    targetCalories: snapshot.targetCalories,
    targetProtein: snapshot.targetProtein,
    targetCarbs: snapshot.targetCarbs,
    targetFat: snapshot.targetFat,
    goal: snapshot.goal,
  };
}

describe("planTargetRevision", () => {
  it("writes the first row for a user with no history", () => {
    expect(planTargetRevision(null, CUT, "2026-01-01")).toEqual({
      write: true,
      effectiveFrom: "2026-01-01",
    });
  });

  it("writes nothing when a save leaves every target unchanged", () => {
    // recalculateProfile reruns the engine on EVERY Settings save.
    const latest = latestFrom(CUT, "2026-01-01");
    expect(planTargetRevision(latest, CUT, "2026-03-14")).toEqual({ write: false });
  });

  it("treats a body-weight-only change as no target change", () => {
    const latest = latestFrom(CUT, "2026-01-01");
    expect(planTargetRevision(latest, { ...CUT, weightKg: 82 }, "2026-02-01")).toEqual({
      write: false,
    });
  });

  it("writes a row dated today when calories change (cut → bulk)", () => {
    const latest = latestFrom(CUT, "2026-01-01");
    const bulk = { ...CUT, targetCalories: 2600, goal: "GAIN_MUSCLE" as const };
    expect(planTargetRevision(latest, bulk, "2026-04-01")).toEqual({
      write: true,
      effectiveFrom: "2026-04-01",
    });
  });

  it.each([
    ["tdee", { tdee: 2350 }],
    ["protein", { targetProtein: 150 }],
    ["carbs", { targetCarbs: 170 }],
    ["fat", { targetFat: 60 }],
    ["goal", { goal: "RECOMP" as const }],
    ["tdee becoming null", { tdee: null }],
  ])("detects a change in %s", (_label, change) => {
    const latest = latestFrom(CUT, "2026-01-01");
    expect(planTargetRevision(latest, { ...CUT, ...change }, "2026-02-01").write).toBe(true);
  });

  it("targets the same day again when changed twice in one day", () => {
    // The upsert on (user, effectiveFrom) then keeps the day's LAST value.
    const latest = latestFrom({ ...CUT, targetCalories: 2000 }, "2026-04-01");
    expect(planTargetRevision(latest, CUT, "2026-04-01")).toEqual({
      write: true,
      effectiveFrom: "2026-04-01",
    });
  });

  it("never dates a row BEFORE the latest one when the user's clock went back", () => {
    // Latest row saved Oct 5 in India; now on a device where it is still Oct 4.
    // An Oct 4 row would sort before Oct 5 and never be read as "latest".
    const latest = latestFrom(CUT, "2026-10-05");
    const changed = { ...CUT, targetCalories: 1900 };
    expect(planTargetRevision(latest, changed, "2026-10-04")).toEqual({
      write: true,
      effectiveFrom: "2026-10-05",
    });
  });

  it("compares dates correctly across month and year boundaries", () => {
    const latest = latestFrom(CUT, "2026-12-31");
    const changed = { ...CUT, targetCalories: 1900 };
    expect(planTargetRevision(latest, changed, "2027-01-01")).toEqual({
      write: true,
      effectiveFrom: "2027-01-01",
    });
  });
});
