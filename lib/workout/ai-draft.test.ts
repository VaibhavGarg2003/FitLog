/**
 * AI workout draft — merging, manual additions, blockers and the payload.
 *
 * This is the state the review screen edits and the store persists, so its
 * invariants are what make "add more exercises" and draft recovery correct.
 */

import { describe, it, expect } from "vitest";
import {
  draftTotals,
  importBlocker,
  manualExercise,
  mergeParse,
  reviewFromParse,
  toImportPayload,
  MAX_IMPORT_SETS,
  type ReviewDraft,
} from "@/lib/workout/ai-draft";
import type { WorkoutDraft } from "@/lib/services/ai-workout.service";

/** A parser response shaped like the real one, including its per-parse line ids. */
function parse(
  lines: Array<{ name: string; id: string; sets: number; weight?: number; reps?: number }>,
  extra: Partial<WorkoutDraft> = {}
): WorkoutDraft {
  return {
    provider: "gemini",
    durationMin: null,
    notes: null,
    warnings: [],
    exercises: lines.map((line, index) => ({
      // The parser numbers lines per response — this collision is the point.
      lineId: `line-${index}`,
      inputName: line.name,
      exercise: { id: line.id, name: line.name, muscleGroup: "Chest", category: "COMPOUND" },
      matchQuality: "exact",
      needsReview: false,
      isCardio: false,
      unit: "kg",
      warnings: [],
      sets: Array.from({ length: line.sets }, () => ({
        weight: line.weight ?? null,
        reps: line.reps ?? null,
        rpe: null,
        isWarmup: false,
      })),
    })),
    totals: { exercises: lines.length, sets: 0, needsReview: 0 },
    ...extra,
  };
}

const READY = { finish: false, duration: "" };

describe("merging a second parse — 'Describe with AI'", () => {
  it("appends to what is already there, keeping the user's edits", () => {
    const first = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 3, weight: 30, reps: 10 }]));
    // The user corrected a weight before adding more.
    first.exercises[0].sets[0].weight = "32.5";

    const merged = mergeParse(first, parse([{ name: "Cable Fly", id: "fly", sets: 3, weight: 15, reps: 12 }]));

    expect(merged.exercises.map((e) => e.exerciseName)).toEqual(["Bench", "Cable Fly"]);
    expect(merged.exercises[0].sets[0].weight).toBe("32.5");
  });

  it("gives every merged line a unique id, despite the parser reusing line-0", () => {
    // Both parses call their first line "line-0". Every edit is addressed by
    // lineId, so a collision would make editing one exercise edit the other.
    const first = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 1, reps: 10 }]));
    const merged = mergeParse(first, parse([{ name: "Fly", id: "fly", sets: 1, reps: 12 }]));

    const ids = merged.exercises.map((e) => e.lineId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every set across both parses its own idempotency key", () => {
    const first = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 3, reps: 10 }]));
    const merged = mergeParse(first, parse([{ name: "Fly", id: "fly", sets: 3, reps: 12 }]));

    const keys = merged.exercises.flatMap((e) => e.sets.map((s) => s.clientRequestId));
    expect(new Set(keys).size).toBe(6);
  });

  it("keeps existing keys unchanged, so a retry still matches the first attempt", () => {
    const first = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 2, reps: 10 }]));
    const before = first.exercises[0].sets.map((s) => s.clientRequestId);

    const merged = mergeParse(first, parse([{ name: "Fly", id: "fly", sets: 1, reps: 12 }]));

    expect(merged.exercises[0].sets.map((s) => s.clientRequestId)).toEqual(before);
  });

  it("fills a missing duration or note but never overwrites one", () => {
    const first = reviewFromParse(
      parse([{ name: "Bench", id: "bench", sets: 1, reps: 10 }], { durationMin: 45 })
    );
    const merged = mergeParse(
      first,
      parse([{ name: "Fly", id: "fly", sets: 1, reps: 12 }], { durationMin: 60, notes: "chest day" })
    );

    expect(merged.durationMin).toBe(45);
    expect(merged.notes).toBe("chest day");
  });

  it("carries draft-level warnings from both parses", () => {
    const first = reviewFromParse(
      parse([{ name: "Bench", id: "bench", sets: 1, reps: 10 }], { warnings: ["first"] })
    );
    const merged = mergeParse(
      first,
      parse([{ name: "Fly", id: "fly", sets: 1, reps: 12 }], { warnings: ["second"] })
    );

    expect(merged.warnings).toEqual(["first", "second"]);
  });
});

describe("adding an exercise by hand — 'Pick an exercise'", () => {
  it("starts with one empty set, so it cannot be imported until filled", () => {
    const review: ReviewDraft = {
      ...reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 1, weight: 30, reps: 10 }])),
    };
    review.exercises.push(manualExercise({ id: "plank", name: "Plank", category: "ISOLATION" }));

    expect(draftTotals(review).emptySets).toBe(1);
    expect(importBlocker(review, READY)).toMatch(/still need a weight or reps/);
  });

  it("is marked as added by hand, resolved, and not needing review", () => {
    const line = manualExercise({ id: "plank", name: "Plank", category: "ISOLATION" });

    expect(line.source).toBe("manual");
    expect(line.exerciseId).toBe("plank");
    expect(line.needsReview).toBe(false);
  });
});

describe("import blockers mirror the server's checks", () => {
  it("is ready when every line is resolved and every set has numbers", () => {
    const review = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 3, weight: 30, reps: 10 }]));
    expect(importBlocker(review, READY)).toBeNull();
  });

  it("blocks an unresolved exercise", () => {
    const review = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 1, reps: 10 }]));
    review.exercises[0].exerciseId = null;
    expect(importBlocker(review, READY)).toMatch(/needs to be picked/);
  });

  it("blocks a merged draft that grew past the 40-set cap", () => {
    // Merging is the new way to exceed the cap — the parser alone could not.
    const first = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 12, reps: 5 }]));
    let merged = first;
    for (let i = 0; i < 3; i++) {
      merged = mergeParse(merged, parse([{ name: `Ex${i}`, id: `ex${i}`, sets: 12, reps: 5 }]));
    }

    expect(draftTotals(merged).sets).toBeGreaterThan(MAX_IMPORT_SETS);
    expect(importBlocker(merged, READY)).toMatch(/can take 40 sets/);
  });

  it("requires a duration only when finishing", () => {
    const review = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 1, weight: 30, reps: 10 }]));
    expect(importBlocker(review, { finish: true, duration: "" })).toMatch(/duration/);
    expect(importBlocker(review, { finish: true, duration: "45" })).toBeNull();
  });
});

describe("the import payload is exactly what is on screen", () => {
  it("sends bodyweight as null weight and only sends notes when finishing", () => {
    const review = reviewFromParse(
      parse([{ name: "Push-Up", id: "pushup", sets: 2, reps: 15 }], { notes: "felt good" })
    );

    const notFinishing = toImportPayload(review, {
      importId: "i", date: "2026-09-13", finish: false, duration: "", keepNotes: true,
    });
    expect(notFinishing.exercises[0].sets[0].weight).toBeNull();
    expect(notFinishing.notes).toBeUndefined();

    const finishing = toImportPayload(review, {
      importId: "i", date: "2026-09-13", finish: true, duration: "40", keepNotes: true,
    });
    expect(finishing.notes).toBe("felt good");
    expect(finishing.durationMin).toBe(40);
  });

  it("includes manually added exercises alongside parsed ones", () => {
    const review = reviewFromParse(parse([{ name: "Bench", id: "bench", sets: 1, weight: 30, reps: 10 }]));
    const plank = manualExercise({ id: "plank", name: "Plank", category: "ISOLATION" });
    plank.sets[0].reps = "60";
    review.exercises.push(plank);

    const payload = toImportPayload(review, {
      importId: "i", date: "2026-09-13", finish: false, duration: "", keepNotes: true,
    });

    expect(payload.exercises.map((e) => e.exerciseId)).toEqual(["bench", "plank"]);
  });
});
