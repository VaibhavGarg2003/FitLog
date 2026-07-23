/**
 * API Schema Tests — the validation gate every request body passes through.
 *
 * These lock in the rule "the database is never the first place bad data
 * gets noticed": negative calories, string numbers, and out-of-range values
 * must be rejected at the route boundary.
 */

import { describe, it, expect } from "vitest";
import {
  logDbFoodSchema,
  logCustomFoodSchema,
  startWorkoutSchema,
  logSetSchema,
  finishSessionSchema,
  logWeightSchema,
  parseMealRequestSchema,
  createShareSchema,
} from "@/lib/validators/api.schema";

describe("logCustomFoodSchema", () => {
  const valid = {
    date: "2026-07-12",
    mealType: "BREAKFAST",
    name: "Poha",
    quantity: 150,
    calories: 270,
  };

  it("accepts a valid custom food and applies defaults", () => {
    const r = logCustomFoodSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unit).toBe("g");
      expect(r.data.protein).toBe(0);
    }
  });

  it("rejects negative calories (the silent-corruption case)", () => {
    expect(
      logCustomFoodSchema.safeParse({ ...valid, calories: -99999 }).success
    ).toBe(false);
  });

  it("rejects non-numeric calories", () => {
    expect(
      logCustomFoodSchema.safeParse({ ...valid, calories: "hello" }).success
    ).toBe(false);
  });

  it("rejects zero quantity", () => {
    expect(
      logCustomFoodSchema.safeParse({ ...valid, quantity: 0 }).success
    ).toBe(false);
  });

  it("rejects absurd numeric extremes (1e308 calories)", () => {
    expect(
      logCustomFoodSchema.safeParse({ ...valid, calories: 1e308 }).success
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      logCustomFoodSchema.safeParse({ ...valid, date: "12-07-2026" }).success
    ).toBe(false);
  });
});

describe("logDbFoodSchema", () => {
  const valid = {
    foodId: "abc-123",
    date: "2026-07-12",
    mealType: "LUNCH",
    quantityGrams: 120,
  };

  it("accepts a valid DB food log", () => {
    expect(logDbFoodSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero/negative quantity", () => {
    expect(
      logDbFoodSchema.safeParse({ ...valid, quantityGrams: 0 }).success
    ).toBe(false);
  });

  it("rejects an unknown meal type", () => {
    expect(
      logDbFoodSchema.safeParse({ ...valid, mealType: "BRUNCH" }).success
    ).toBe(false);
  });
});

describe("startWorkoutSchema", () => {
  it("defaults mode to RECALL", () => {
    const r = startWorkoutSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mode).toBe("RECALL");
  });

  it("rejects an invalid split type", () => {
    expect(
      startWorkoutSchema.safeParse({ splitType: "LEGS_ONLY" }).success
    ).toBe(false);
  });
});

describe("logSetSchema", () => {
  const valid = { exerciseId: "ex-1", setNumber: 1, weight: 60, reps: 8 };

  it("accepts a valid set", () => {
    expect(logSetSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects RPE outside 1-10", () => {
    expect(logSetSchema.safeParse({ ...valid, rpe: 11 }).success).toBe(false);
  });

  it("rejects fractional set numbers", () => {
    expect(logSetSchema.safeParse({ ...valid, setNumber: 1.5 }).success).toBe(
      false
    );
  });
});

describe("finishSessionSchema", () => {
  it("requires a positive integer duration", () => {
    expect(finishSessionSchema.safeParse({ durationMin: 45 }).success).toBe(
      true
    );
    expect(finishSessionSchema.safeParse({ durationMin: 0 }).success).toBe(
      false
    );
    expect(finishSessionSchema.safeParse({}).success).toBe(false);
  });
});

describe("logWeightSchema", () => {
  it("enforces the 30-300 kg physical range", () => {
    expect(logWeightSchema.safeParse({ weightKg: 82.5 }).success).toBe(true);
    expect(logWeightSchema.safeParse({ weightKg: 20 }).success).toBe(false);
    expect(logWeightSchema.safeParse({ weightKg: 400 }).success).toBe(false);
  });
});

describe("parseMealRequestSchema", () => {
  const valid = { text: "2 rotis with dal", mealType: "LUNCH", date: "2026-07-12" };

  it("accepts a valid parse request", () => {
    expect(parseMealRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects text under 3 characters (after trimming)", () => {
    expect(
      parseMealRequestSchema.safeParse({ ...valid, text: "  a  " }).success
    ).toBe(false);
  });

  it("rejects a missing date", () => {
    expect(
      parseMealRequestSchema.safeParse({ text: "dal", mealType: "LUNCH" })
        .success
    ).toBe(false);
  });
});

describe("createShareSchema", () => {
  const valid = { templateId: "tpl-1" };

  it("accepts a minimal request (title is optional)", () => {
    expect(createShareSchema.safeParse(valid).success).toBe(true);
  });

  it("trims a provided title", () => {
    const r = createShareSchema.safeParse({ ...valid, title: "  Push Day  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Push Day");
  });

  it("rejects a whitespace-only title (the blank-title slip)", () => {
    expect(
      createShareSchema.safeParse({ ...valid, title: "   " }).success
    ).toBe(false);
  });

  it("rejects a missing or empty templateId", () => {
    expect(createShareSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(createShareSchema.safeParse({ templateId: "" }).success).toBe(false);
  });

  it("enforces expiresInDays as an integer within 1–365", () => {
    expect(createShareSchema.safeParse({ ...valid, expiresInDays: 90 }).success).toBe(true);
    expect(createShareSchema.safeParse({ ...valid, expiresInDays: 0 }).success).toBe(false);
    expect(createShareSchema.safeParse({ ...valid, expiresInDays: 366 }).success).toBe(false);
    expect(createShareSchema.safeParse({ ...valid, expiresInDays: 1.5 }).success).toBe(false);
  });
});
