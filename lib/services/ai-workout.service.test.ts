/**
 * AI workout parser — matching, clamping and expansion.
 *
 * The LLM is mocked with fixed replies: these tests lock what our own code
 * does with a response, which is the part that decides what reaches the
 * database. No network, no model, no flake.
 *
 * The database is mocked too — findAllExercisesForMatching returns a slice of
 * the real seeded catalog (real names, real categories), so the matching
 * assertions are about real data without needing Postgres.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EXERCISE_ALIASES,
  normalizeExerciseName,
  resolveAlias,
  isAmbiguousTerm,
} from "@/lib/ai/exercise-aliases";
import { exercises as seededExercises } from "@/prisma/seeds/data/exercises";

const runWithFallback = vi.hoisted(() => vi.fn());
const findAllExercisesForMatching = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/fallback", () => ({ runWithFallback }));
vi.mock("@/lib/repositories/exercise.repository", () => ({
  findAllExercisesForMatching,
  findExercisesByIds: vi.fn(),
}));

import {
  parseWorkoutText,
  clearCatalogCache,
  MAX_TOTAL_SETS,
} from "@/lib/services/ai-workout.service";

/** The real catalog, shaped the way the repository returns it. */
const CATALOG = seededExercises.map((exercise, index) => ({
  id: `ex-${index}`,
  name: exercise.name,
  muscleGroup: exercise.muscleGroup,
  category: exercise.category,
  metValue: exercise.metValue,
  isCompound: exercise.isCompound,
}));

function mockAiReply(payload: unknown) {
  runWithFallback.mockResolvedValue({
    ok: true,
    text: JSON.stringify(payload),
    provider: "gemini",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCatalogCache();
  findAllExercisesForMatching.mockResolvedValue(CATALOG);
});

// ─────────────────────────────────────────────────────────────
// The alias table must describe exercises that actually exist
// ─────────────────────────────────────────────────────────────

describe("exercise aliases", () => {
  it("every alias points at a real seeded exercise", () => {
    const names = new Set(seededExercises.map((e) => e.name));
    const broken = Object.entries(EXERCISE_ALIASES).filter(
      ([, catalogName]) => !names.has(catalogName)
    );
    expect(broken).toEqual([]);
  });

  it("normalises gym shorthand and Hinglish filler to the same key", () => {
    expect(normalizeExerciseName("Incline DB Press")).toBe(
      normalizeExerciseName("incline dumbbell press")
    );
    // "bench pe 4 set lagaye" — the filler is scaffolding, not a name.
    expect(normalizeExerciseName("bench pe 4 set lagaye")).toBe("bench 4");
    expect(normalizeExerciseName("Push-Up")).toBe(
      normalizeExerciseName("pushups")
    );
    expect(normalizeExerciseName("T-Bar Row")).toBe(
      normalizeExerciseName("t bar rows")
    );
  });

  it("resolves hyphenated short plurals — the most common spelling", () => {
    // Regression: singularize() skips words of 3 letters or fewer, so "ups"
    // stayed "ups" and every one of these missed its catalog row. The suite
    // only tested "pushups"; a live parse of "Push-ups" found it.
    expect(resolveAlias("Push-ups")).toBe("Push-Up");
    expect(resolveAlias("push ups")).toBe("Push-Up");
    expect(resolveAlias("Pull-ups")).toBe("Pull-Up");
    expect(resolveAlias("Chin-ups")).toBe("Chin-Up");
  });

  it("resolves slang to exact catalog names", () => {
    expect(resolveAlias("OHP")).toBe("Overhead Press (Barbell)");
    expect(resolveAlias("RDL")).toBe("Romanian Deadlift");
    expect(resolveAlias("ham curls")).toBe("Leg Curl (Lying)");
    expect(resolveAlias("lat pull down")).toBe("Lat Pulldown");
  });

  it("treats bare family words as ambiguous", () => {
    // The failure this prevents: "rows" prefix-matches "Rowing Machine",
    // a CARDIO exercise, which also changes the session's calorie burn.
    expect(isAmbiguousTerm("rows")).toBe(true);
    expect(isAmbiguousTerm("curl")).toBe(true);
    expect(isAmbiguousTerm("press")).toBe(true);
    // ...but a qualified name is not ambiguous.
    expect(isAmbiguousTerm("cable row")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────

describe("parseWorkoutText — matching", () => {
  it("keeps a ramp intact, one set per weight", async () => {
    mockAiReply({
      durationMin: 55,
      notes: "push day",
      exercises: [
        {
          inputName: "bench press",
          quote: "bench",
          catalogName: "Barbell Bench Press",
          unit: "kg",
          sets: [
            { weight: 40, reps: 12 },
            { weight: 50, reps: 10 },
            { weight: 55, reps: 8 },
            { weight: 55, reps: 8 },
          ],
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench 40x12 50x10 55x8 55x8, 55 min");

    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0].exercise?.name).toBe("Barbell Bench Press");
    expect(draft.exercises[0].matchQuality).toBe("exact");
    expect(draft.exercises[0].needsReview).toBe(false);
    expect(draft.exercises[0].sets).toEqual([
      { weight: 40, reps: 12, rpe: null, isWarmup: false },
      { weight: 50, reps: 10, rpe: null, isWarmup: false },
      { weight: 55, reps: 8, rpe: null, isWarmup: false },
      { weight: 55, reps: 8, rpe: null, isWarmup: false },
    ]);
    expect(draft.durationMin).toBe(55);
  });

  it("expands the repeat shorthand into individual sets", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "incline db press",
          quote: "incline db press",
          catalogName: "Incline Dumbbell Press",
          repeat: { count: 3, reps: 12, weight: 15 },
        },
      ],
    });

    const draft = await parseWorkoutText("incline db press 3x12 with 15kg");

    expect(draft.exercises[0].sets).toHaveLength(3);
    expect(draft.exercises[0].sets.every((s) => s.weight === 15)).toBe(true);
    expect(draft.totals.sets).toBe(3);
  });

  it("resolves slang through the alias tier", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "OHP",
          quote: "ohp",
          catalogName: null,
          repeat: { count: 3, reps: 8, weight: 40 },
        },
      ],
    });

    const draft = await parseWorkoutText("ohp 3x8 40");

    expect(draft.exercises[0].exercise?.name).toBe("Overhead Press (Barbell)");
    expect(draft.exercises[0].matchQuality).toBe("alias");
  });

  it("refuses to guess a bare family word", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "rows",
          quote: "rows",
          catalogName: null,
          repeat: { count: 3, reps: 12, weight: 40 },
        },
      ],
    });

    const draft = await parseWorkoutText("3x12 rows at 40kg");

    // Must NOT silently become "Rowing Machine".
    expect(draft.exercises[0].exercise).toBeNull();
    expect(draft.exercises[0].matchQuality).toBe("none");
    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.totals.needsReview).toBe(1);
  });

  it("flags a fuzzy match instead of accepting it", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bulgarian split",
          quote: "bulgarian split",
          catalogName: null,
          repeat: { count: 3, reps: 10, weight: 20 },
        },
      ],
    });

    const draft = await parseWorkoutText("bulgarian split 3x10 20kg");

    expect(draft.exercises[0].matchQuality).toBe("fuzzy");
    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.length).toBeGreaterThan(0);
  });

  it("does not let the model's catalog pick bypass the ambiguity guard", async () => {
    // The dangerous shape: the user typed a bare family word, and the model
    // confidently supplies a REAL catalog name — a cardio row, no less, which
    // would also change the session's calorie burn. It may be offered as a
    // suggestion, but it must never be auto-accepted.
    mockAiReply({
      exercises: [
        {
          inputName: "rows",
          quote: "rows",
          catalogName: "Rowing Machine",
          repeat: { count: 3, reps: 12, weight: 40 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("3x12 rows at 40kg");

    expect(draft.exercises[0].matchQuality).not.toBe("exact");
    expect(draft.exercises[0].matchQuality).not.toBe("alias");
    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("prefers the user's own words over a conflicting model pick", async () => {
    // "bench press" has a curated alias (Barbell Bench Press). The model
    // suggesting the dumbbell variant must not silently override it.
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Dumbbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press 3x8 60");

    expect(draft.exercises[0].exercise?.name).toBe("Barbell Bench Press");
    // And the disagreement is surfaced rather than hidden.
    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.join(" ")).toMatch(
      /Dumbbell Bench Press/
    );
  });

  it("catches an OMITTED qualifier, not just an added one", async () => {
    // The user did INCLINE dumbbell press. The model reports the line as plain
    // "dumbbell press" — nothing was added, a word was dropped — and the alias
    // resolves that to the FLAT bench. Auditing the words the model kept can
    // never see this; matching the user's own quote does.
    mockAiReply({
      exercises: [
        {
          inputName: "dumbbell press",
          quote: "dumbbell press",
          catalogName: "Dumbbell Bench Press",
          repeat: { count: 3, reps: 12, weight: 20 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("incline dumbbell press 3x12 20kg");

    // "dumbbell press" is not a span of that paragraph ("incline dumbbell
    // press" is), so the line cannot claim to be the user's words.
    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("catches a qualifier that is not on the qualifier list", async () => {
    // "diamond" is not in QUALIFIER_TOKENS, and no such list is ever complete.
    // Quote matching does not depend on the list being complete.
    mockAiReply({
      exercises: [
        {
          inputName: "diamond push up",
          quote: "diamond push up",
          catalogName: "Diamond Push-Up",
          repeat: { count: 3, reps: 10 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("push ups 3x10");

    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("does not let one line borrow a qualifier from another", async () => {
    // "dumbbell" appears in the paragraph — but on the CURLS line, not the
    // bench line. A whole-paragraph token check would wave this through.
    mockAiReply({
      exercises: [
        {
          inputName: "dumbbell press",
          quote: "dumbbell press",
          catalogName: "Dumbbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("dumbbell curls 3x12, bench press 3x8 60kg");

    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("flags a qualifier the user typed that the matched exercise lacks", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "seated calf raise",
          quote: "standing calf raise",
          catalogName: "Calf Raise (Seated)",
          repeat: { count: 3, reps: 15, weight: 40 },
        },
      ],
    });

    const draft = await parseWorkoutText("standing calf raise 3x15 40kg");

    // Resolution runs on the quote, so this lands on the STANDING row; the
    // model's seated pick is surfaced as a disagreement.
    expect(draft.exercises[0].exercise?.name).toBe("Calf Raise (Standing)");
    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("checks EVERY occurrence of a repeated quote, not just the first", async () => {
    // "dumbbell press ... then incline dumbbell press": the second line quotes
    // the shorter span, which verifies. Looking only at the first occurrence
    // sees no "incline" and auto-accepts the FLAT exercise for a line that was
    // the incline one.
    mockAiReply({
      exercises: [
        {
          inputName: "dumbbell press",
          quote: "dumbbell press",
          catalogName: "Dumbbell Bench Press",
          repeat: { count: 3, reps: 10, weight: 20 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText(
      "dumbbell press 3x10 20kg, then incline dumbbell press 3x10 20kg"
    );

    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("catches a qualifier written AFTER the exercise name", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press incline 3x8 60kg");

    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("rejects a real quote that does not belong to this line's numbers", async () => {
    // "bench" really is in the paragraph — as furniture. A model that hangs
    // sets off it produces a confident, entirely invented exercise.
    mockAiReply({
      exercises: [
        {
          inputName: "bench",
          quote: "bench",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 10, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText(
      "I rested on the bench, then did cable fly 3x12 at 15kg"
    );

    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.join(" ")).toMatch(/not next to/i);
  });

  it("catches a qualifier separated from the name by other words", async () => {
    // "30 degree" sits between the name and the qualifier, so requiring the
    // qualifier to be directly adjacent missed it and auto-accepted the FLAT
    // bench. The clause is the unit, not adjacency.
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press 30 degree incline, 3x8 60kg");

    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.join(" ")).toMatch(/incline/i);
  });

  it("does not let a NEIGHBOURING clause's qualifier flag a clean line", async () => {
    // The counterweight to the test above: scanning the whole paragraph would
    // flag this bench line because a later clause says "incline". A review
    // screen that flags clean lines is one users stop reading.
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText(
      "bench press 3x8 60kg, then incline dumbbell press 3x10 20kg"
    );

    expect(draft.exercises[0].exercise?.name).toBe("Barbell Bench Press");
    expect(draft.exercises[0].needsReview).toBe(false);
  });

  it("follows a qualifier into its own clause when that clause names no exercise", async () => {
    // "bench press, 30 degree incline, 3x8" — people punctuate mid-description,
    // so the qualifier lands in a clause of its own. It is still describing the
    // bench press, because "30 degree incline" names no exercise by itself.
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press, 30 degree incline, 3x8 60kg");

    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.join(" ")).toMatch(/incline/i);
  });

  it("stops absorbing at a clause that names its own exercise", async () => {
    // The counterweight: the next clause also starts with a qualifier, but it
    // names "dumbbell press", so it is the NEXT exercise and lends nothing to
    // the bench line.
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText(
      "bench press 3x8 60kg, incline dumbbell press 3x10 20kg"
    );

    expect(draft.exercises[0].exercise?.name).toBe("Barbell Bench Press");
    expect(draft.exercises[0].needsReview).toBe(false);
  });

  it("does not auto-accept an inputName the user never typed", async () => {
    // inputName is supposed to be the user's own words, and the matcher trusts
    // it over the model's catalog pick — but it comes out of the same model
    // response. If the model rewrites "bench press" into the dumbbell variant
    // in BOTH fields they agree with each other, and nothing else would catch
    // it. The typed paragraph is the authority.
    mockAiReply({
      exercises: [
        {
          inputName: "Dumbbell Bench Press",
          catalogName: "Dumbbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press 3x8 60kg");

    expect(draft.exercises[0].needsReview).toBe(true);
    expect(draft.exercises[0].warnings.join(" ")).toMatch(/Could not match|Best guess/i);
  });

  it("still auto-accepts a line the user really did type", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          quote: "bench press",
          catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 },
          confidence: "high",
        },
      ],
    });

    const draft = await parseWorkoutText("bench press 3x8 60kg");

    expect(draft.exercises[0].exercise?.name).toBe("Barbell Bench Press");
    expect(draft.exercises[0].needsReview).toBe(false);
  });

  it("never invents an exercise the model made up", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "moon press",
          quote: "moon press",
          catalogName: "Moon Press 3000",
          repeat: { count: 3, reps: 10, weight: 20 },
        },
      ],
    });

    const draft = await parseWorkoutText("moon press 3x10");

    expect(draft.exercises[0].exercise).toBeNull();
    expect(draft.exercises[0].matchQuality).toBe("none");
  });
});

describe("parseWorkoutText — the response is untrusted", () => {
  it("drops only the impossible sets and says so", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          catalogName: "Barbell Bench Press",
          sets: [
            { weight: 9000, reps: 8 }, // over the 1000kg cap
            { weight: 60, reps: 8 }, // fine
            { weight: -20, reps: 8 }, // negative
            { weight: 65, reps: 6 }, // fine
          ],
        },
      ],
    });

    const draft = await parseWorkoutText("bench nonsense");

    // The two usable sets survive; the two impossible ones are dropped rather
    // than taking their neighbours down with them.
    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0].sets).toEqual([
      { weight: 60, reps: 8, rpe: null, isWarmup: false },
      { weight: 65, reps: 6, rpe: null, isWarmup: false },
    ]);
    // And the user is told, rather than quietly getting fewer sets.
    expect(draft.exercises[0].warnings.join(" ")).toMatch(/dropped/i);
    expect(draft.exercises[0].needsReview).toBe(true);
  });

  it("clamps an out-of-range RPE by dropping that set, never storing 9", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          catalogName: "Barbell Bench Press",
          sets: [{ weight: 60, reps: 8, rpe: 9 }],
        },
      ],
    });

    const draft = await parseWorkoutText("bench 1x8 60 rpe 9");

    // This app's set scale is 1-5. A 9 is not coerced into 5 here — the prompt
    // asks the model to map it; anything that still arrives as 9 is a set we
    // do not understand, and logSetSchema would reject it at the write anyway.
    for (const set of draft.exercises[0]?.sets ?? []) {
      expect(set.rpe === null || (set.rpe >= 1 && set.rpe <= 5)).toBe(true);
    }
  });

  it("auto-accepts the exact paragraph that first failed on localhost", async () => {
    // The real reply shape Gemini returned for the first live test, so this
    // locks in what an actual model produced rather than what we assumed.
    mockAiReply({
      exercises: [
        { inputName: "Bench press", quote: "Bench press",
          catalogName: "Barbell Bench Press", repeat: { count: 3, reps: 10, weight: 30 } },
        { inputName: "Cable fly", quote: "Cable fly",
          catalogName: "Cable Fly", repeat: { count: 3, reps: 10, weight: 40 } },
        { inputName: "Push-ups", quote: "Push-ups",
          catalogName: "Push-Up", repeat: { count: 3, reps: 10 } },
      ],
    });

    const draft = await parseWorkoutText(
      "- Bench press: 30 kg, 10 reps, 3 sets\n- Cable fly: 40 kg, 10 reps, 3 sets\n- Push-ups: 10 reps, 3 sets"
    );

    expect(draft.exercises.map((e) => e.exercise?.name)).toEqual([
      "Barbell Bench Press",
      "Cable Fly",
      "Push-Up",
    ]);
    // A clean, ordinary paragraph should need no review at all.
    expect(draft.totals.needsReview).toBe(0);
  });

  it("keeps bodyweight sets as null weight, never zero", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "push ups",
          catalogName: "Push-Up",
          repeat: { count: 3, reps: 15 },
        },
      ],
    });

    const draft = await parseWorkoutText("push-ups 3x15 bodyweight");

    expect(draft.exercises[0].sets[0].weight).toBeNull();
    expect(draft.exercises[0].sets[0].reps).toBe(15);
  });

  it("does not let a string 'false' become a true warmup flag", async () => {
    mockAiReply({
      exercises: [
        {
          inputName: "bench press",
          catalogName: "Barbell Bench Press",
          sets: [{ weight: 60, reps: 8, warmup: "false" }],
        },
      ],
    });

    const draft = await parseWorkoutText("bench 1x8 60");

    expect(draft.exercises[0].sets[0].isWarmup).toBe(false);
  });

  it("caps the total number of sets one paragraph can create", async () => {
    mockAiReply({
      exercises: Array.from({ length: 10 }, () => ({
        inputName: "bench press",
        catalogName: "Barbell Bench Press",
        repeat: { count: 12, reps: 8, weight: 60 },
      })),
    });

    const draft = await parseWorkoutText("a very long workout");

    expect(draft.totals.sets).toBeLessThanOrEqual(MAX_TOTAL_SETS);
  });

  it("reads JSON even when a provider wraps it in a markdown fence", async () => {
    runWithFallback.mockResolvedValue({
      ok: true,
      provider: "openrouter",
      text:
        "```json\n" +
        JSON.stringify({
          exercises: [
            {
              inputName: "squats",
              catalogName: "Barbell Back Squat",
              repeat: { count: 5, reps: 5, weight: 80 },
            },
          ],
        }) +
        "\n```",
    });

    const draft = await parseWorkoutText("squats 5x5 80");

    expect(draft.exercises[0].exercise?.name).toBe("Barbell Back Squat");
    expect(draft.provider).toBe("openrouter");
  });

  it("tells the user plainly when nothing could be read", async () => {
    mockAiReply({ exercises: [] });

    await expect(parseWorkoutText("I went to the gym")).rejects.toThrow(
      /No exercises were found/i
    );
  });

  it("surfaces a total provider outage as an upstream failure", async () => {
    runWithFallback.mockResolvedValue({
      ok: false,
      error: "All AI providers failed.",
      attempts: [],
    });

    await expect(parseWorkoutText("bench 3x8")).rejects.toThrow(
      /could not be reached.*log this workout manually/i
    );
  });

  it("says so when a whole exercise could not be read", async () => {
    mockAiReply({
      exercises: [
        { inputName: "bench press", catalogName: "Barbell Bench Press",
          repeat: { count: 3, reps: 8, weight: 60 } },
        { nonsense: true }, // no inputName — unreadable as an exercise
      ],
    });

    const draft = await parseWorkoutText("bench 3x8 60 and something odd");

    expect(draft.exercises).toHaveLength(1);
    // The dropped line is announced at draft level, not silently swallowed.
    expect(draft.warnings.join(" ")).toMatch(/could not be read/i);
  });
});

describe("parseWorkoutText — cardio", () => {
  it("flags cardio for manual detail rather than inventing reps", async () => {
    mockAiReply({
      durationMin: 20,
      exercises: [
        {
          inputName: "treadmill",
          catalogName: "Running (Treadmill)",
          isCardio: true,
          sets: [{ reps: 1 }],
        },
      ],
    });

    const draft = await parseWorkoutText("20 min treadmill");

    expect(draft.exercises[0].isCardio).toBe(true);
    expect(draft.exercises[0].needsReview).toBe(true);
  });
});
