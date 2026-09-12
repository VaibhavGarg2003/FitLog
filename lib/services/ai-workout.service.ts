/**
 * AI Workout Service — natural language → a reviewable workout draft
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHAT THIS DOES:
 * ───────────────
 * Turns "bench 4 sets - 40x12, 50x10, 55x8, 55x8. incline db press 3x12 @ 15"
 * into a structured draft the review screen can show. It writes NOTHING. The
 * user confirms, and workout.service.importWorkout does the writing.
 *
 * WHY ITS OWN FILE (not ai.service.ts):
 * ─────────────────────────────────────
 * ai.service.ts is already 500+ lines of meal parsing plus weekly insights.
 * Workout parsing has its own trust boundary, its own matching rules and its
 * own failure modes; mixing them would make all three harder to reason about.
 *
 * THE DIVISION OF LABOUR — the rule this file exists to enforce:
 * ─────────────────────────────────────────────────────────────
 *   The AI reads language.       (which words are an exercise, which are sets)
 *   This code decides meaning.   (which CATALOG ROW that is, what the numbers
 *                                 are allowed to be)
 *   Postgres guarantees the write. (uniqueness, one-time-ness, atomicity)
 *
 * The model's own "confidence" is advisory and never decides anything. Only
 * exact and alias matches are auto-accepted; everything fuzzy is handed to the
 * user to confirm. See exercise-aliases.ts for why guessing is dangerous here.
 */

import { z } from "zod";
import { runWithFallback } from "@/lib/ai/fallback";
import { WORKOUT_PARSER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import {
  buildCatalogList,
  isAmbiguousTerm,
  normalizeExerciseName,
  resolveAlias,
  QUALIFIER_TOKENS,
} from "@/lib/ai/exercise-aliases";
import {
  findAllExercisesForMatching,
  type ExerciseMatchRow,
} from "@/lib/repositories/exercise.repository";
import { UpstreamError, UserFacingError } from "@/lib/utils/errors";

// ─────────────────────────────────────────────────────────────
// LIMITS — every one of these is also enforced by the write path
// ─────────────────────────────────────────────────────────────

/** Hard caps. The prompt asks for these; this file enforces them. */
export const MAX_EXERCISES = 15;
export const MAX_SETS_PER_EXERCISE = 12;
export const MAX_TOTAL_SETS = 40;

/** Matches logSetSchema exactly — the AI may not write what a human cannot. */
const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 200;

/**
 * A metric user typing a three-digit weight is usually reading an imperial
 * plate ("bench 225"). We never convert silently (the app stores and displays
 * kg only, and the manual logger does no conversion either), but above this
 * the review screen asks.
 */
const IMPLAUSIBLE_KG_THRESHOLD = 250;

// ─────────────────────────────────────────────────────────────
// THE LLM RESPONSE IS UNTRUSTED INPUT
// ─────────────────────────────────────────────────────────────
//
// Same rule as the meal parser: an LLM produces plausible text, not correct
// data. Every numeric field is coerced and clamped before it can reach a
// draft, let alone the database.
//
// Booleans are NOT coerced. z.coerce.boolean("false") === true, which would
// silently mark every set as a warm-up. A non-boolean falls back to false.

const boolish = z.boolean().catch(false);

const llmSetSchema = z.object({
  weight: z.coerce.number().positive().max(MAX_WEIGHT_KG).nullish(),
  reps: z.coerce.number().int().positive().max(MAX_REPS).nullish(),
  rpe: z.coerce.number().int().min(1).max(5).nullish(),
  warmup: boolish.nullish(),
});

const llmRepeatSchema = z.object({
  count: z.coerce.number().int().positive().max(MAX_SETS_PER_EXERCISE),
  weight: z.coerce.number().positive().max(MAX_WEIGHT_KG).nullish(),
  reps: z.coerce.number().int().positive().max(MAX_REPS).nullish(),
  rpe: z.coerce.number().int().min(1).max(5).nullish(),
  warmup: boolish.nullish(),
});

// `sets` and `repeat` stay UNKNOWN here and are validated set by set in
// expandSets. Validating the array as a whole means one hallucinated weight
// (9000kg) throws away the three good sets beside it — the meal parser learned
// the same lesson and keeps the items it can use. Dropped sets are counted and
// surfaced as a warning, never silently discarded.
const llmExerciseSchema = z.object({
  inputName: z.string().trim().min(1).max(100),
  /**
   * The exact span from the user's paragraph naming this exercise. Checked
   * against the text — see verifyQuote for why this, and not inputName, is the
   * only string in the reply that can be treated as the user's own words.
   */
  quote: z.string().trim().max(120).nullish(),
  catalogName: z.string().trim().max(120).nullish(),
  unit: z.enum(["kg", "lb"]).nullish(),
  sets: z.array(z.unknown()).max(MAX_SETS_PER_EXERCISE).nullish(),
  repeat: z.unknown().nullish(),
  isCardio: boolish.nullish(),
  repRange: z.string().trim().max(20).nullish(),
  toFailure: boolish.nullish(),
  confidence: z.enum(["high", "low"]).nullish(),
});

const llmResponseSchema = z.object({
  durationMin: z.coerce.number().int().positive().max(1440).nullish(),
  notes: z.string().trim().max(200).nullish(),
  exercises: z.array(z.unknown()).max(MAX_EXERCISES),
});

type LlmExercise = z.infer<typeof llmExerciseSchema>;

// ─────────────────────────────────────────────────────────────
// DRAFT TYPES — the contract with the review screen
// ─────────────────────────────────────────────────────────────

/** How a line was resolved. Only "exact" and "alias" are auto-accepted. */
export type MatchQuality = "exact" | "alias" | "fuzzy" | "none";

export interface DraftSet {
  /** kg, as written by the user. Null = bodyweight / not stated. */
  weight: number | null;
  reps: number | null;
  /** The app's 1-5 intensity scale, never the gym's 1-10 RPE. */
  rpe: number | null;
  isWarmup: boolean;
}

export interface DraftExercise {
  /** Stable id for React keys and for edits coming back from the client. */
  lineId: string;
  /** What the user actually wrote, shown when the match needs confirming. */
  inputName: string;
  exercise: {
    id: string;
    name: string;
    muscleGroup: string;
    category: string;
  } | null;
  matchQuality: MatchQuality;
  /** True when the user must look at this line before it can be imported. */
  needsReview: boolean;
  isCardio: boolean;
  /** "lb" only ever means "the text said lbs" — nothing is converted. */
  unit: "kg" | "lb";
  warnings: string[];
  sets: DraftSet[];
}

export interface WorkoutDraft {
  provider: string;
  durationMin: number | null;
  notes: string | null;
  exercises: DraftExercise[];
  /**
   * Things that happened to the WHOLE draft rather than one line — an
   * unreadable exercise that had to be dropped, or a workout long enough to
   * hit the set budget. Anything removed has to be said out loud: a silent
   * omission becomes permanent the moment the user finishes the session.
   */
  warnings: string[];
  totals: {
    exercises: number;
    sets: number;
    needsReview: number;
  };
}

// ─────────────────────────────────────────────────────────────
// CATALOG CACHE
// ─────────────────────────────────────────────────────────────
//
// `exercises` is seeded reference data that changes only on a re-seed, and
// every parse needs all of it twice (once for the prompt, once for matching).
// A per-instance cache keeps a warm lambda down to zero catalog queries.
// TTL rather than forever so a re-seed is picked up without a redeploy.

const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { rows: ExerciseMatchRow[]; fetchedAt: number } | null = null;

async function getCatalog(): Promise<ExerciseMatchRow[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.rows;
  }

  const rows = await findAllExercisesForMatching();
  catalogCache = { rows, fetchedAt: now };
  return rows;
}

/** Test seam: drop the cached catalog. */
export function clearCatalogCache(): void {
  catalogCache = null;
}

// ─────────────────────────────────────────────────────────────
// MATCHING — deterministic, and deliberately willing to give up
// ─────────────────────────────────────────────────────────────

interface MatchResult {
  row: ExerciseMatchRow | null;
  quality: MatchQuality;
  /** Populated when a fuzzy match had rivals, so the UI can say so. */
  alternatives: string[];
  /** Set when the model's pick disagreed with what the user's own words mean. */
  modelDisagreement: string | null;
  /** False when the line could not be traced to the typed paragraph. */
  grounded: boolean;
  /** Qualifier words the user typed that the matched exercise does not have. */
  droppedQualifiers: string[];
  /** The quote confirmed to be in the paragraph, or null. */
  verifiedQuote: string | null;
}

/**
 * The words the user REALLY typed for this line, or null.
 *
 * Everything in the model's reply is untrusted, `inputName` included — it is
 * supposed to be the user's phrasing, but the model writes it, so it can be
 * quietly rewritten ("bench press" → "Dumbbell Bench Press") and then agree
 * with the model's own catalog pick. Two untrusted fields confirming each
 * other is not corroboration.
 *
 * So the model is asked for a `quote`: the exact span from the paragraph. That
 * IS checkable — a quote either appears in the text or it does not — and a
 * verified quote is the only string in the reply we can treat as the user's.
 *
 * WHY NOT JUST COMPARE QUALIFIER WORDS (the previous attempt): it checked the
 * qualifiers *present in* the model's phrasing against tokens *anywhere in* the
 * paragraph, which left three ways through:
 *   • omission — "incline dumbbell press" reported as "dumbbell press" hides
 *     the dropped "incline", and the line lands on the FLAT bench row
 *   • an unlisted qualifier — "push ups" reported as "diamond push up" passes,
 *     because "diamond" was not in the qualifier list, and no list is complete
 *   • borrowing — "dumbbell curls ... bench press" lets the bench line claim
 *     "dumbbell", because that word is somewhere in the paragraph
 * Matching the quote instead of auditing the paraphrase closes all three: the
 * resolution never sees the model's wording at all.
 *
 * Comparison is on the normalised forms, so case, punctuation and filler do
 * not matter — "Incline DB press" quotes "incline db press" successfully.
 */
function verifyQuote(
  quote: string | null | undefined,
  normalizedText: string
): string | null {
  if (!quote) return null;

  const normalizedQuote = normalizeExerciseName(quote);
  if (normalizedQuote.length === 0) return null;

  return normalizedText.includes(normalizedQuote) ? normalizedQuote : null;
}

/**
 * Qualifier words sitting immediately BEFORE the quote in the paragraph.
 *
 * A verified quote proves the words are in the text; it does not prove they are
 * ALL of the name. "incline dumbbell press" contains "dumbbell press", so a
 * model that quotes only the tail passes verification while the dropped
 * "incline" sends the line to the flat bench row. Reading back from where the
 * quote starts catches the truncation the substring test cannot.
 */
function splitIntoClauses(text: string): string[][] {
  return text
    // Punctuation and sequencing words are where one exercise ends and the
    // next begins, in English and Hinglish alike. Split BEFORE normalising,
    // because normalisation removes exactly these markers.
    .split(/[,.;:\n!?]+|\bthen\b|\bafter that\b|\bfir\b|\bphir\b|\baur\b/i)
    .map((clause) => normalizeExerciseName(clause).split(" ").filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

/**
 * Qualifier words sitting in the same CLAUSE as the quote.
 *
 * A verified quote proves the words are in the text; it does not prove they are
 * all of the name. Three ways a name gets truncated, all seen in real phrasing:
 *   "INCLINE dumbbell press"        quoted as "dumbbell press"  (before)
 *   "bench press INCLINE"           quoted as "bench press"     (after)
 *   "bench press 30 degree INCLINE" quoted as "bench press"     (after, with
 *                                                                words between)
 *
 * Requiring the qualifier to be directly adjacent caught the first two and
 * missed the third. Scanning the whole paragraph instead would catch all three
 * and also flag every line whose NEIGHBOUR mentions a qualifier. The clause is
 * the right unit: wide enough for "30 degree incline", narrow enough that
 * "bench press 3x8, then incline press 3x10" keeps the bench line clean.
 *
 * Every clause containing the quote is inspected, not the first — a paragraph
 * can name the same span twice ("dumbbell press ... incline dumbbell press"),
 * and when the occurrences disagree there is no way to tell which one this line
 * came from, so the user is asked.
 */
function qualifiersAroundQuote(
  clauses: string[][],
  normalizedQuote: string,
  byNormalizedName: Map<string, ExerciseMatchRow>
): string[] {
  const quoteTokens = normalizedQuote.split(" ");
  const quoteSet = new Set(quoteTokens);
  const found = new Set<string>();

  const collect = (tokens: string[]) => {
    for (const token of tokens) {
      if (QUALIFIER_TOKENS.has(token) && !quoteSet.has(token)) {
        found.add(token);
      }
    }
  };

  for (const [index, tokens] of clauses.entries()) {
    const containsQuote = tokens.some((_, i) =>
      quoteTokens.every((token, j) => tokens[i + j] === token)
    );
    if (!containsQuote) continue;

    collect(tokens);

    // People punctuate mid-description: "bench press, 30 degree incline, 3x8"
    // puts the qualifier in its own clause, and stopping at the comma would
    // read that as the flat bench. So neighbouring clauses are absorbed —
    // but ONLY while they do not name an exercise of their own. That is what
    // separates a continuation ("30 degree incline") from the next exercise
    // ("then incline dumbbell press 3x10"), which must not lend its words to
    // the line before it.
    for (let before = index - 1; before >= 0; before--) {
      if (clauseNamesExercise(clauses[before], byNormalizedName)) break;
      collect(clauses[before]);
    }
    for (let after = index + 1; after < clauses.length; after++) {
      if (clauseNamesExercise(clauses[after], byNormalizedName)) break;
      collect(clauses[after]);
    }
  }

  return [...found];
}

/**
 * Does this clause name an exercise in its own right?
 *
 * Used to decide whether a neighbouring clause is a continuation of the
 * current exercise or the start of the next one. Any sub-span that resolves
 * exactly or through the alias table counts: "incline dumbbell press 3x10"
 * contains "dumbbell press", so it is a new exercise; "30 degree incline"
 * contains nothing resolvable, so it is still describing the previous one.
 */
function clauseNamesExercise(
  tokens: string[],
  byNormalizedName: Map<string, ExerciseMatchRow>
): boolean {
  const maxSpan = Math.min(4, tokens.length);

  for (let length = maxSpan; length >= 1; length--) {
    for (let i = 0; i + length <= tokens.length; i++) {
      const span = tokens.slice(i, i + length).join(" ");
      if (resolveDeterministic(span, byNormalizedName)) return true;
    }
  }

  return false;
}

/**
 * Do this line's numbers actually appear beside the words it quotes?
 *
 * A verified quote proves the words are in the paragraph. It does not prove
 * they NAME this exercise: "I rested on the bench, then did cable fly 3x12"
 * contains "bench", which resolves cleanly to Barbell Bench Press, and a model
 * that attached sets to it would have produced a confident, wrong line.
 *
 * Tying the quote to its own numbers raises that bar: a line claiming 3×10 has
 * to point at a part of the text where 10 actually appears. It cannot close the
 * case completely — a fabricated line that borrows the numbers standing next to
 * its quote still passes — and no string comparison can, because the model is
 * the thing deciding where one exercise ends and the next begins. That residual
 * is exactly what the review screen is for: nothing reaches the database
 * without a person seeing it listed.
 *
 * A line with no numbers at all (a named exercise the user gave no sets for)
 * skips the check; there is nothing to correlate.
 */
function quoteIsNearItsNumbers(
  normalizedText: string,
  normalizedQuote: string,
  sets: DraftSet[]
): boolean {
  const values = new Set<string>();
  for (const set of sets) {
    if (set.weight != null) values.add(String(set.weight));
    if (set.reps != null) values.add(String(set.reps));
  }
  if (values.size === 0) return true;

  const textTokens = normalizedText.split(" ");
  const quoteTokens = normalizedQuote.split(" ");
  /** Generous enough for "bench press 4 sets - 40x12, 50x10, 55x8". */
  const WINDOW = 10;

  for (let i = 0; i + quoteTokens.length <= textTokens.length; i++) {
    const matches = quoteTokens.every(
      (token, j) => textTokens[i + j] === token
    );
    if (!matches) continue;

    // Numbers usually follow the name, occasionally precede it ("3x10 bench").
    const from = Math.max(0, i - 3);
    const to = Math.min(textTokens.length, i + quoteTokens.length + WINDOW);

    for (let k = from; k < to; k++) {
      for (const value of values) {
        if (textTokens[k].includes(value)) return true;
      }
    }
  }

  return false;
}

/**
 * Did the user name a qualifier this exercise does not have?
 *
 * Belt and braces on top of quote-based resolution: if the quote says
 * "incline" and the row we landed on is the flat bench, the user said
 * something we did not honour, and they should see that before it is written.
 */
function qualifiersDropped(
  normalizedQuote: string,
  rowName: string
): string[] {
  const rowTokens = new Set(normalizeExerciseName(rowName).split(" "));

  return normalizedQuote
    .split(" ")
    .filter((token) => QUALIFIER_TOKENS.has(token) && !rowTokens.has(token));
}

/**
 * Stable tie-break for fuzzy tiers: shortest name first (the generic
 * "Lat Pulldown" beats "Close Grip Lat Pulldown"), then alphabetical.
 *
 * WHY STABLE ORDERING MATTERS: `findFirst` + `contains` returns whichever row
 * the database happens to produce first. The same sentence would then log a
 * different exercise before and after a re-seed. Same lesson the food matcher
 * learned; see pickBestMatch in ai.service.ts.
 */
function sortCandidates(rows: ExerciseMatchRow[]): ExerciseMatchRow[] {
  return [...rows].sort(
    (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)
  );
}

/** Deterministic resolution of ONE piece of text: exact name, then alias. */
function resolveDeterministic(
  text: string | null | undefined,
  byNormalizedName: Map<string, ExerciseMatchRow>
): { row: ExerciseMatchRow; quality: "exact" | "alias" } | null {
  if (!text) return null;

  const exact = byNormalizedName.get(normalizeExerciseName(text));
  if (exact) return { row: exact, quality: "exact" };

  const aliased = resolveAlias(text);
  if (aliased) {
    const hit = byNormalizedName.get(normalizeExerciseName(aliased));
    if (hit) return { row: hit, quality: "alias" };
  }

  return null;
}

/** Prefix then substring, with a stable tie-break. Never auto-accepted. */
function resolveFuzzy(
  text: string,
  catalog: ExerciseMatchRow[]
): { row: ExerciseMatchRow; alternatives: string[] } | null {
  const needle = normalizeExerciseName(text);
  if (needle.length < 3) return null;

  const prefix = catalog.filter((row) =>
    normalizeExerciseName(row.name).startsWith(needle)
  );
  const contains = catalog.filter((row) =>
    normalizeExerciseName(row.name).includes(needle)
  );

  const tier = prefix.length > 0 ? prefix : contains;
  if (tier.length === 0) return null;

  const sorted = sortCandidates(tier);
  return {
    row: sorted[0],
    alternatives: sorted.slice(1, 4).map((row) => row.name),
  };
}

/**
 * Resolve one parsed line to a catalog row.
 *
 * THE USER'S OWN WORDS ARE AUTHORITATIVE. The model's `catalogName` is a
 * SUGGESTION and never outranks them.
 *
 * An earlier version checked `catalogName` first and called any catalog hit
 * "exact". That handed the model a bypass around every safety rule in this
 * file:
 *   • "bench press 3x8" with the model answering "Dumbbell Bench Press" beat
 *     the curated alias (→ Barbell Bench Press) and was auto-accepted silently.
 *   • "press 3x10" — a bare family word the ambiguity guard exists to stop —
 *     sailed through, because the guard only ran after the exact tier.
 * The model cannot invent a row that does not exist, but it can absolutely
 * pick the WRONG REAL ONE, which is the failure that looks correct on screen.
 *
 * THE ORDER NOW:
 *   1. the user's words resolve deterministically → authoritative, auto-accept
 *      (and if the model disagreed, say so, and ask for a look)
 *   2. the user's words are a bare family word → never auto-accept; offer the
 *      model's pick as a suggestion to confirm, or give up
 *   3. only the model's pick resolves → accept as a SUGGESTION (needs review):
 *      the user's words matched nothing we know, so this is the model's leap
 *   4. fuzzy on the user's words → suggestion (needs review)
 *   5. nothing → unresolved, the review screen asks
 */
function matchExercise(
  line: LlmExercise,
  catalog: ExerciseMatchRow[],
  byNormalizedName: Map<string, ExerciseMatchRow>,
  normalizedText: string,
  clauses: string[][]
): MatchResult {
  // The ONLY string here we can prove came from the user. Everything
  // deterministic resolves from this; the model's own wording never does.
  const quote = verifyQuote(line.quote, normalizedText);
  const grounded = quote !== null;

  const fromInput = quote ? resolveDeterministic(quote, byNormalizedName) : null;
  const fromModel = resolveDeterministic(line.catalogName, byNormalizedName);

  // 1. What the user actually wrote wins — but only if they actually wrote it.
  if (fromInput) {
    const agrees = fromModel != null && fromModel.row.id === fromInput.row.id;
    const disagreement =
      fromModel && !agrees ? fromModel.row.name : null;

    // The quote said "incline" and we landed on the flat bench? Then a word
    // the user typed was not honoured, and they get to see that. Words just
    // BEFORE the quote count too — that is how a truncated quote hides one.
    const rowTokens = new Set(
      normalizeExerciseName(fromInput.row.name).split(" ")
    );
    const dropped = quote
      ? [
          ...new Set([
            ...qualifiersDropped(quote, fromInput.row.name),
            ...qualifiersAroundQuote(clauses, quote, byNormalizedName).filter(
              (token) => !rowTokens.has(token)
            ),
          ]),
        ]
      : [];
    if (dropped.length > 0) {
      return {
        row: fromInput.row,
        quality: "fuzzy",
        alternatives: disagreement ? [disagreement] : [],
        modelDisagreement: disagreement,
        grounded,
        droppedQualifiers: dropped,
        verifiedQuote: quote,
      };
    }

    return {
      row: fromInput.row,
      // When both routes land on the same row, report the stronger evidence:
      // "exact" means a name was matched verbatim on at least one side.
      quality:
        agrees && (fromModel.quality === "exact" || fromInput.quality === "exact")
          ? "exact"
          : fromInput.quality,
      alternatives: disagreement ? [disagreement] : [],
      modelDisagreement: disagreement,
      grounded,
      droppedQualifiers: [],
      verifiedQuote: quote,
    };
  }

  // 2. A bare family word ("row", "curl", "press") is never resolved on our
  //    own authority — see exercise-aliases.ts for the "rows" → "Rowing
  //    Machine" failure. The model's pick may still be shown, to confirm.
  if (isAmbiguousTerm(quote ?? line.inputName)) {
    return fromModel
      ? {
          row: fromModel.row,
          quality: "fuzzy",
          alternatives: [],
          modelDisagreement: null,
          grounded,
          droppedQualifiers: [],
          verifiedQuote: quote,
        }
      : {
          row: null,
          quality: "none",
          alternatives: [],
          modelDisagreement: null,
          grounded,
          droppedQualifiers: [],
          verifiedQuote: quote,
        };
  }

  // 3. Only the model resolved it: a leap from words we do not recognise.
  if (fromModel) {
    return {
      row: fromModel.row,
      quality: "fuzzy",
      alternatives: [],
      modelDisagreement: null,
      grounded,
      droppedQualifiers: [],
      verifiedQuote: quote,
    };
  }

  // 4. Our own fuzzy tiers, still never auto-accepted.
  const fuzzy = resolveFuzzy(quote ?? line.inputName, catalog);
  if (fuzzy) {
    return {
      row: fuzzy.row,
      quality: "fuzzy",
      alternatives: fuzzy.alternatives,
      modelDisagreement: null,
      grounded,
      droppedQualifiers: [],
      verifiedQuote: quote,
    };
  }

  return {
    row: null,
    quality: "none",
    alternatives: [],
    modelDisagreement: null,
    grounded,
    droppedQualifiers: [],
    verifiedQuote: quote,
  };
}

// ─────────────────────────────────────────────────────────────
// SET EXPANSION
// ─────────────────────────────────────────────────────────────

/**
 * Turn the model's `sets` array or `repeat` shorthand into concrete rows.
 *
 * `repeat` exists because a response carrying 40 fully-written set objects can
 * exceed the 2048 output-token budget every provider in the chain shares. The
 * expansion happens here, where it is free.
 */
function expandSets(line: LlmExercise): { sets: DraftSet[]; dropped: number } {
  const rows: DraftSet[] = [];
  let dropped = 0;

  if (Array.isArray(line.sets) && line.sets.length > 0) {
    for (const raw of line.sets.slice(0, MAX_SETS_PER_EXERCISE)) {
      const parsed = llmSetSchema.safeParse(raw);
      if (!parsed.success) {
        // Out of range or unreadable: drop THIS set, keep its neighbours, and
        // tell the user one went missing.
        dropped++;
        continue;
      }
      rows.push({
        weight: parsed.data.weight ?? null,
        reps: parsed.data.reps ?? null,
        rpe: parsed.data.rpe ?? null,
        isWarmup: parsed.data.warmup === true,
      });
    }
    return { sets: rows, dropped };
  }

  const repeat = llmRepeatSchema.safeParse(line.repeat);
  if (repeat.success) {
    const count = Math.min(repeat.data.count, MAX_SETS_PER_EXERCISE);
    for (let i = 0; i < count; i++) {
      rows.push({
        weight: repeat.data.weight ?? null,
        reps: repeat.data.reps ?? null,
        rpe: repeat.data.rpe ?? null,
        isWarmup: repeat.data.warmup === true,
      });
    }
  } else if (line.repeat != null) {
    dropped++;
  }

  return { sets: rows, dropped };
}

/**
 * Everything the user must be told about one line before importing it.
 * Returns the warnings; the caller decides whether they force a review.
 */
function buildWarnings(
  line: LlmExercise,
  match: MatchResult,
  sets: DraftSet[],
  unit: "kg" | "lb",
  droppedSets: number
): string[] {
  const warnings: string[] = [];

  if (droppedSets > 0) {
    warnings.push(
      `${droppedSets} set${droppedSets === 1 ? "" : "s"} had numbers we could not use and ${droppedSets === 1 ? "was" : "were"} dropped.`
    );
  }

  if (match.quality === "none") {
    warnings.push("Could not find this exercise — pick one to continue.");
  } else if (match.quality === "fuzzy") {
    const also =
      match.alternatives.length > 0
        ? ` Could also be: ${match.alternatives.join(", ")}.`
        : "";
    warnings.push(`Best guess from "${line.inputName}".${also}`);
  }

  // The user's words and the model's pick named different exercises. We went
  // with the user's, and say so rather than quietly overruling either one.
  if (match.modelDisagreement) {
    warnings.push(
      `The parser suggested "${match.modelDisagreement}" instead — check which you did.`
    );
  }

  // The model could not point at the words in the paragraph that produced this
  // line, so nothing here traces back to the user. It may well be right; it is
  // not authoritative.
  if (!match.grounded && match.row) {
    warnings.push(
      `Could not match "${line.inputName}" to the words you typed — confirm this is the exercise you did.`
    );
  }

  // The user named something the matched exercise is not: "incline" landing on
  // the flat bench, "seated" landing on the standing version.
  if (match.droppedQualifiers.length > 0 && match.row) {
    warnings.push(
      `You wrote "${match.droppedQualifiers.join('", "')}" but this is ${match.row.name} — check it.`
    );
  }

  if (unit === "lb") {
    warnings.push(
      "Text said lbs. Weights are stored as written — the app records kg only."
    );
  }

  if (line.repRange) {
    warnings.push(`Rep range "${line.repRange}" — using the lower number.`);
  }

  if (line.toFailure || sets.some((set) => set.reps === null)) {
    warnings.push("No rep count given — add one before importing.");
  }

  if (match.row?.category === "CARDIO") {
    // v1 does not parse cardio: an exercise_sets row has no distance, pace or
    // incline column, so there is nothing honest to put in it. Say what to do
    // instead of leaving a line the user cannot resolve.
    warnings.push(
      sets.some((set) => set.weight !== null || set.reps !== null)
        ? "Cardio with weights or reps — check this, or remove the line and log the cardio by hand."
        : "Cardio is not imported yet (no distance or pace to store). Remove this line, or log it by hand after."
    );
  }

  if (
    unit === "kg" &&
    sets.some((set) => set.weight !== null && set.weight > IMPLAUSIBLE_KG_THRESHOLD)
  ) {
    warnings.push("That weight looks high for kg — was it lbs?");
  }

  if (line.confidence === "low" && match.quality !== "exact") {
    warnings.push("The parser was unsure about this line.");
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────
// JSON EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Gemini and Groq are asked for JSON natively; OpenRouter (the last fallback)
 * is not — see the comment in openrouter.ts — so a reply can arrive wrapped in
 * a markdown fence. Strip it rather than fail the whole workout on the one
 * provider that was our last resort.
 */
function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : text;

  try {
    return JSON.parse(candidate);
  } catch {
    throw new UserFacingError(
      "The AI returned something we could not read. Please try rephrasing your workout."
    );
  }
}

// ─────────────────────────────────────────────────────────────
// THE PARSE
// ─────────────────────────────────────────────────────────────

/**
 * Parse a workout paragraph into a reviewable draft. Writes nothing.
 *
 * FLOW:
 * 1. Read the catalog (cached) — needed for the prompt AND the matching
 * 2. Ask the model, with the catalog attached, via the existing fallback chain
 * 3. Validate its JSON (trust boundary), dropping unusable lines
 * 4. Match every line deterministically
 * 5. Return the draft plus the counts the review screen leads with
 */
export async function parseWorkoutText(text: string): Promise<WorkoutDraft> {
  const catalog = await getCatalog();

  if (catalog.length === 0) {
    // Seeds never ran. Parsing would produce nothing but unresolved lines.
    throw new UserFacingError(
      "The exercise list is empty, so workouts cannot be matched yet."
    );
  }

  // 1 + 2. One message carrying the workout and the menu to pick from.
  const aiResult = await runWithFallback({
    systemPrompt: WORKOUT_PARSER_SYSTEM_PROMPT,
    userMessage: [
      `Workout: "${text}"`,
      "",
      "EXERCISE CATALOG (copy catalogName EXACTLY from this list, or use null):",
      buildCatalogList(catalog),
    ].join("\n"),
  });

  if (!aiResult.ok) {
    // Every provider failed. The chain's own message tells the user to "log
    // your meal manually" — it was written for the nutrition parser and is
    // wrong here, so the workout path says the workout thing. Provider details
    // stay in aiResult.attempts (server logs only).
    throw new UpstreamError(
      "The AI could not be reached. Please log this workout manually."
    );
  }

  // 3. Validate the envelope, then each line on its own, so one malformed
  //    exercise costs that exercise and not the whole workout.
  const envelope = llmResponseSchema.safeParse(extractJson(aiResult.text));
  if (!envelope.success || envelope.data.exercises.length === 0) {
    throw new UserFacingError(
      "No exercises were found in that text. Try naming the exercise, sets and reps."
    );
  }

  const parsedLines = envelope.data.exercises.map((raw) =>
    llmExerciseSchema.safeParse(raw)
  );
  const lines = parsedLines
    .filter((result) => result.success)
    .map((result) => result.data);

  const draftWarnings: string[] = [];
  const unreadableLines = parsedLines.length - lines.length;
  if (unreadableLines > 0) {
    draftWarnings.push(
      `${unreadableLines} exercise${unreadableLines === 1 ? "" : "s"} could not be read and ${unreadableLines === 1 ? "is" : "are"} not shown below.`
    );
  }

  // 4. Match, expand and annotate. A hard total-set budget is applied across
  //    the whole draft so a runaway response cannot produce 300 rows.
  const byNormalizedName = new Map(
    catalog.map((row) => [normalizeExerciseName(row.name), row])
  );

  // The typed paragraph, normalised the same way exercise names are, so a
  // claimed quote can be checked against what the user actually wrote.
  const normalizedText = normalizeExerciseName(text);
  // Clause-level view of the same text, for qualifier attribution.
  const clauses = splitIntoClauses(text);

  const exercises: DraftExercise[] = [];
  let totalSets = 0;
  let droppedLines = 0;

  for (const [index, line] of lines.entries()) {
    const match = matchExercise(
      line,
      catalog,
      byNormalizedName,
      normalizedText,
      clauses
    );
    const unit: "kg" | "lb" = line.unit === "lb" ? "lb" : "kg";

    const expanded = expandSets(line);
    let sets = expanded.sets;

    if (sets.length === 0) {
      // A named exercise with no usable numbers is still worth showing — the
      // user can fill it in — but only when we know what exercise it is. An
      // unknown name with no numbers is nothing to show, so it goes; that is
      // still a removal, so it is counted and announced below.
      if (!match.row) {
        droppedLines++;
        continue;
      }
      sets = [{ weight: null, reps: null, rpe: null, isWarmup: false }];
    }

    if (totalSets + sets.length > MAX_TOTAL_SETS) {
      const kept = Math.max(0, MAX_TOTAL_SETS - totalSets);
      draftWarnings.push(
        `This workout is longer than one import can take (${MAX_TOTAL_SETS} sets). ` +
          `Everything after ${line.inputName} was left out — log the rest separately.`
      );
      sets = sets.slice(0, kept);
      if (sets.length === 0) break;
    }
    totalSets += sets.length;

    const warnings = buildWarnings(line, match, sets, unit, expanded.dropped);
    const isCardio = match.row?.category === "CARDIO" || line.isCardio === true;

    // The quote is real text, but are this line's numbers anywhere near it?
    // If not, the words were probably lifted from somewhere else in the
    // paragraph and this line does not describe what it claims to.
    const numbersMatch =
      match.verifiedQuote === null ||
      quoteIsNearItsNumbers(normalizedText, match.verifiedQuote, sets);

    if (!numbersMatch && match.row) {
      warnings.push(
        `These numbers are not next to "${match.verifiedQuote}" in what you typed — check this line.`
      );
    }

    exercises.push({
      lineId: `line-${index}`,
      inputName: line.inputName,
      exercise: match.row
        ? {
            id: match.row.id,
            name: match.row.name,
            muscleGroup: match.row.muscleGroup,
            category: match.row.category,
          }
        : null,
      matchQuality: match.quality,
      // Auto-accept ONLY exact and alias matches. Anything fuzzy, unresolved,
      // cardio, or missing reps is the user's call before it becomes rows.
      needsReview:
        match.quality === "fuzzy" ||
        match.quality === "none" ||
        isCardio ||
        // No verified quote, so "the user's own words won" is not something we
        // can assert for this line.
        !match.grounded ||
        // Quote verified, but the line's numbers are somewhere else entirely.
        !numbersMatch ||
        warnings.length > 0,
      isCardio,
      unit,
      warnings,
      sets,
    });
  }

  if (droppedLines > 0) {
    draftWarnings.push(
      `${droppedLines} line${droppedLines === 1 ? "" : "s"} named something we could not match and had no sets to show, so ${droppedLines === 1 ? "it is" : "they are"} not listed.`
    );
  }

  if (exercises.length === 0) {
    throw new UserFacingError(
      "No exercises were found in that text. Try naming the exercise, sets and reps."
    );
  }

  return {
    provider: aiResult.provider,
    durationMin: envelope.data.durationMin ?? null,
    notes: envelope.data.notes ?? null,
    exercises,
    warnings: draftWarnings,
    totals: {
      exercises: exercises.length,
      sets: totalSets,
      needsReview: exercises.filter((exercise) => exercise.needsReview).length,
    },
  };
}
