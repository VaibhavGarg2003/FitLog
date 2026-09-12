/**
 * Exercise Aliases + Name Normalisation
 * ══════════════════════════════════════
 *
 * WHAT THIS IS FOR:
 * ─────────────────
 * The AI workout parser receives gym shorthand — "incline db press", "OHP",
 * "ham curls", "bench lagaye" — while the `exercises` table holds 155 formal
 * names like "Overhead Press (Barbell)". This module is the deterministic
 * bridge between the two. It contains NO AI: given the same input it returns
 * the same answer today and after a re-seed.
 *
 * WHY A CODE FILE AND NOT A DATABASE TABLE (yet):
 * ───────────────────────────────────────────────
 * An `ExerciseAlias` table is the right long-term home, but it needs a way to
 * add rows (admin UI or seeder) before it earns a migration. A reviewed,
 * version-controlled map ships today and moves into a table unchanged later.
 *
 * THE AMBIGUITY RULE — the most important thing in this file:
 * ───────────────────────────────────────────────────────────
 * Some gym words name a FAMILY, not an exercise: "row", "curl", "press",
 * "dips", "fly". A fuzzy matcher handed "rows" happily returns "Rowing
 * Machine" — the only catalog name STARTING with "row" — which is a CARDIO
 * row. Three sets then land on the wrong exercise AND the session's calorie
 * estimate changes, because finishSession switches on whether any set is
 * CARDIO. The numbers still look plausible, so nobody notices.
 *
 * So bare family words live in AMBIGUOUS_TERMS and are never fuzzy-matched.
 * They come back unresolved and the review screen asks which one was meant.
 * Refusing to guess is the feature.
 */

/**
 * Words carrying no exercise meaning on their own. Stripped before matching so
 * "bench 4 set lagaye" and "bench press" normalise to the same thing.
 *
 * Hinglish entries are here because the users of this app type that way; they
 * are sentence scaffolding (kiya = did, lagaye = performed, pe = at), never
 * part of an exercise name.
 */
const FILLER_WORDS = new Set([
  // English
  "the", "a", "an", "and", "then", "some", "did", "doing", "done", "do",
  "exercise", "exercises", "workout", "today", "my", "for", "of", "with",
  "at", "on", "in", "to", "reps", "rep", "sets", "set", "kg", "kgs", "lb",
  "lbs", "kilo", "kilos",
  // Hinglish
  "kiya", "kiye", "kia", "lagaye", "lagaya", "lagae", "maara", "mare",
  "aaj", "tha", "thi", "pe", "par", "ka", "ke", "ki", "mein", "me",
  "wala", "wali", "bhi", "fir", "phir", "aur",
]);

/**
 * Short forms expanded BEFORE matching, token by token, so "db incline press"
 * and "incline db press" both reach "dumbbell".
 */
const TOKEN_EXPANSIONS: Record<string, string> = {
  db: "dumbbell",
  dbs: "dumbbell",
  bb: "barbell",
  ez: "ez bar",
  bw: "bodyweight",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  sldl: "stiff-leg deadlift",
  bss: "bulgarian split squat",
  ham: "hamstring",
  hams: "hamstring",
  quad: "quadricep",
  quads: "quadricep",
  tri: "tricep",
  tris: "tricep",
  bi: "bicep",
  bis: "bicep",
  lat: "lateral",
  // Joined compounds. The catalog spells these with a hyphen ("Push-Up"),
  // which normalises to two words, but people type them as one. Without these
  // "pushups" and "Push-Up" would never meet.
  pushup: "push up",
  pullup: "pull up",
  chinup: "chin up",
  situp: "sit up",
  stepup: "step up",
  // Short plurals. singularize() leaves words of three letters or fewer alone
  // (so "lbs"-style tokens are not mangled), which meant "ups" never became
  // "up" — and "Push-ups", "pull-ups", "chin-ups", "sit-ups", the MOST common
  // spellings, all missed their catalog rows. Found by a live parse, not a
  // test: the test suite only ever tried the one-word "pushups".
  ups: "up",
  abs: "ab",
  legpress: "leg press",
  deadlifts: "deadlift",
};

/**
 * Gym slang → EXACT catalog name. Every value on the right MUST exist in
 * prisma/seeds/data/exercises.ts. A typo here degrades to an unresolved line
 * rather than a wrong write, but it is still a bug — the unit tests assert
 * every value resolves against the seed data.
 */
export const EXERCISE_ALIASES: Readonly<Record<string, string>> = {
  // ── Chest ──
  "bench": "Barbell Bench Press",
  "bench press": "Barbell Bench Press",
  "flat bench": "Barbell Bench Press",
  "flat bench press": "Barbell Bench Press",
  "barbell bench": "Barbell Bench Press",
  "incline bench": "Incline Barbell Bench Press",
  "incline bench press": "Incline Barbell Bench Press",
  "decline bench": "Decline Barbell Bench Press",
  "dumbbell bench": "Dumbbell Bench Press",
  "dumbbell press": "Dumbbell Bench Press",
  "incline dumbbell press": "Incline Dumbbell Press",
  "incline dumbbell bench": "Incline Dumbbell Press",
  "incline press": "Incline Dumbbell Press",
  "chest press": "Chest Press Machine",
  "pec deck": "Pec Deck / Machine Fly",
  "machine fly": "Pec Deck / Machine Fly",
  "cable crossover": "Cable Crossover (High-to-Low)",
  "push up": "Push-Up",
  "diamond push up": "Diamond Push-Up",

  // ── Back ──
  "deadlift": "Conventional Deadlift",
  "conventional deadlift": "Conventional Deadlift",
  "romanian deadlift": "Romanian Deadlift",
  "stiff leg deadlift": "Stiff-Leg Deadlift",
  "barbell row": "Barbell Row (Bent Over)",
  "bent over row": "Barbell Row (Bent Over)",
  "dumbbell row": "Dumbbell Row (Single Arm)",
  "one arm row": "Dumbbell Row (Single Arm)",
  "single arm row": "Dumbbell Row (Single Arm)",
  "t bar row": "T-Bar Row",
  "cable row": "Seated Cable Row",
  "seated row": "Seated Cable Row",
  "seated cable row": "Seated Cable Row",
  "machine row": "Machine Row (Hammer Strength)",
  "lat pulldown": "Lat Pulldown",
  "lat pull down": "Lat Pulldown",
  "pulldown": "Lat Pulldown",
  "pull down": "Lat Pulldown",
  "pull up": "Pull-Up",
  "chin up": "Chin-Up",
  "face pull": "Face Pull",
  "shrug": "Shrugs (Barbell)",
  "barbell shrug": "Shrugs (Barbell)",
  "dumbbell shrug": "Dumbbell Shrug",

  // ── Legs ──
  "squat": "Barbell Back Squat",
  "back squat": "Barbell Back Squat",
  "barbell squat": "Barbell Back Squat",
  "front squat": "Front Squat",
  "goblet squat": "Goblet Squat",
  "hack squat": "Hack Squat",
  "leg press": "Leg Press",
  "bulgarian split squat": "Bulgarian Split Squat",
  "split squat": "Bulgarian Split Squat",
  "lunge": "Walking Lunges",
  "walking lunge": "Walking Lunges",
  "leg extension": "Leg Extension",
  "quadricep extension": "Leg Extension",
  "leg curl": "Leg Curl (Lying)",
  "lying leg curl": "Leg Curl (Lying)",
  "seated leg curl": "Leg Curl (Seated)",
  "hamstring curl": "Leg Curl (Lying)",
  "calf raise": "Calf Raise (Standing)",
  "standing calf raise": "Calf Raise (Standing)",
  "seated calf raise": "Calf Raise (Seated)",
  "hip thrust": "Hip Thrust (Barbell)",
  "glute bridge": "Glute Bridge",
  "good morning": "Good Morning",

  // ── Shoulders ──
  "overhead press": "Overhead Press (Barbell)",
  "military press": "Overhead Press (Barbell)",
  "shoulder press": "Dumbbell Shoulder Press",
  "dumbbell shoulder press": "Dumbbell Shoulder Press",
  "arnold press": "Arnold Press",
  "lateral raise": "Lateral Raise",
  "side raise": "Lateral Raise",
  "side lateral raise": "Lateral Raise",
  "front raise": "Front Raise",
  "rear delt fly": "Reverse Fly (Bent Over)",
  "reverse fly": "Reverse Fly (Bent Over)",
  "upright row": "Upright Row",

  // ── Arms ──
  "barbell curl": "Barbell Curl",
  "bicep curl": "Barbell Curl",
  "dumbbell curl": "Dumbbell Curl",
  "hammer curl": "Hammer Curl",
  "preacher curl": "Preacher Curl",
  "cable curl": "Cable Curl",
  "ez bar curl": "EZ Bar Curl",
  "concentration curl": "Concentration Curl",
  "tricep pushdown": "Tricep Pushdown (Cable)",
  "pushdown": "Tricep Pushdown (Cable)",
  "rope pushdown": "Tricep Pushdown (Cable)",
  "cable pushdown": "Tricep Pushdown (Cable)",
  "skull crusher": "Skull Crusher (Lying Tricep Extension)",
  "lying tricep extension": "Skull Crusher (Lying Tricep Extension)",
  "overhead tricep extension": "Overhead Tricep Extension (Dumbbell)",
  "tricep kickback": "Kickback (Dumbbell)",
  "tricep dip": "Dips (Tricep)",
  "wrist curl": "Wrist Curl",

  // ── Core ──
  "plank": "Plank",
  "crunch": "Crunch",
  "hanging leg raise": "Hanging Leg Raise",
  "cable crunch": "Cable Crunch",
  "russian twist": "Russian Twist",
  "ab wheel": "Ab Wheel Rollout",
  "mountain climber": "Mountain Climber",

  // ── Cardio (recognised so it can be FLAGGED, not silently logged) ──
  "treadmill": "Running (Treadmill)",
  "running": "Running (Outdoor)",
  "jogging": "Jogging",
  "cycling": "Cycling (Stationary)",
  "cycle": "Cycling (Stationary)",
  "elliptical": "Elliptical",
  "stair climber": "Stair Climber",
  "skipping": "Jump Rope / Skipping",
  "jump rope": "Jump Rope / Skipping",
  "rowing machine": "Rowing Machine",
  "rower": "Rowing Machine",
  "hiit": "HIIT (Generic)",
  "burpee": "Burpee",
};

/**
 * Family words that name a GROUP of exercises rather than one exercise.
 *
 * A bare one of these is never fuzzy-matched — see the module header for the
 * "rows" → "Rowing Machine" failure it prevents. Aliases are checked FIRST, so
 * "cable row" still resolves while "row" alone does not.
 */
export const AMBIGUOUS_TERMS: ReadonlySet<string> = new Set([
  "row", "press", "curl", "raise", "fly", "extension", "pull", "push",
  "dip", "machine", "cable", "dumbbell", "barbell", "bodyweight",
  "chest", "back", "leg", "arm", "shoulder", "bicep", "tricep",
  "core", "ab", "cardio", "warmup", "warm up",
]);

/**
 * Words that CHANGE WHICH EXERCISE YOU MEAN — equipment, angle, stance, grip.
 *
 * Used to check the parser's claimed quoting of the user against the paragraph
 * they actually typed. "bench" → "bench press" is a harmless expansion and must
 * not be flagged, or every second line would demand attention and the review
 * would stop meaning anything. "bench press" → "DUMBBELL bench press" is a
 * different exercise, a different row, and a different progression history.
 *
 * So only these words are checked for. Everything else the model adds is
 * treated as phrasing.
 */
export const QUALIFIER_TOKENS: ReadonlySet<string> = new Set([
  // equipment
  "dumbbell", "barbell", "machine", "cable", "smith", "band", "kettlebell",
  "ez", "bar", "plate", "landmine", "sled",
  // angle / position
  "incline", "decline", "flat", "seated", "standing", "lying", "bent",
  "overhead", "upright", "prone", "hanging", "front", "back", "side",
  // grip / stance / variant
  "close", "wide", "narrow", "reverse", "single", "neutral", "sumo",
  "romanian", "bulgarian", "goblet", "hack", "preacher", "concentration",
  "spider", "hammer", "pendlay", "meadows", "arnold", "zercher",
  // body part, because it separates whole families ("leg curl" vs "bicep curl")
  "leg", "hamstring", "quadricep", "calf", "glute", "chest", "tricep",
  "bicep", "lateral", "rear", "wrist",
]);

/** Plural → singular, for the handful of endings gym words actually use. */
function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2); // presses → press
  if (word.endsWith("ses")) return word.slice(0, -2); // raises → raise
  if (word.endsWith("es") && /(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * Canonical form, applied to BOTH sides of every comparison.
 *
 * lowercase → drop anything that is not a letter, digit or space (this also
 * flattens "Dips (Chest)" and "Cable Crossover (High-to-Low)") → expand short
 * forms → drop filler → singularise → collapse whitespace.
 *
 * Hyphens become spaces, so "T-Bar Row" agrees with "t bar row", and "Push-Up"
 * matches "push up" and "pushups".
 */
export function normalizeExerciseName(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const token of tokens) {
    // Expansion is tried on the token AND on its singular, so "pushups" →
    // "pushup" → "push up" reaches the same key as the catalog's "Push-Up".
    const expanded =
      TOKEN_EXPANSIONS[token] ?? TOKEN_EXPANSIONS[singularize(token)] ?? token;
    for (const part of expanded.split(" ")) {
      const singular = singularize(part);
      // Filler is checked on BOTH forms: "sets" singularises to "set", but
      // "press" must not be dropped merely because "presses" appeared.
      if (FILLER_WORDS.has(part) || FILLER_WORDS.has(singular)) continue;
      out.push(singular);
    }
  }

  return out.join(" ").trim();
}

/** Aliases keyed by their normalised form, built once at module load. */
const NORMALIZED_ALIASES: Map<string, string> = new Map(
  Object.entries(EXERCISE_ALIASES).map(([alias, catalogName]) => [
    normalizeExerciseName(alias),
    catalogName,
  ])
);

/**
 * Alias lookup. Returns the EXACT catalog name, or null when the text is not a
 * known alias. Callers pass raw text; normalisation happens here.
 */
export function resolveAlias(raw: string): string | null {
  return NORMALIZED_ALIASES.get(normalizeExerciseName(raw)) ?? null;
}

/** True when the text is a bare family word that must not be fuzzy-matched. */
export function isAmbiguousTerm(raw: string): boolean {
  const normalized = normalizeExerciseName(raw);
  if (!normalized) return true;
  return AMBIGUOUS_TERMS.has(normalized);
}

/**
 * Compact catalog listing for the prompt: "Chest: Barbell Bench Press | ...".
 * Grouping by muscle costs a few tokens and measurably helps the model pick
 * within the right family.
 *
 * Kept terse on purpose — every token here is spent against the latency budget
 * (Gemini 4s, whole chain 8s, Vercel wall ~10s).
 */
export function buildCatalogList(
  exercises: Array<{ name: string; muscleGroup: string }>
): string {
  const byMuscle = new Map<string, string[]>();
  for (const exercise of exercises) {
    const list = byMuscle.get(exercise.muscleGroup);
    if (list) list.push(exercise.name);
    else byMuscle.set(exercise.muscleGroup, [exercise.name]);
  }

  return [...byMuscle.entries()]
    .map(([muscle, names]) => `${muscle}: ${names.join(" | ")}`)
    .join("\n");
}
