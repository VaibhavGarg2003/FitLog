/**
 * AI Service — Business Logic for AI Features
 * ═════════════════════════════════════════════
 *
 * TWO MAIN FUNCTIONS:
 * ───────────────────
 * 1. parseMealText()  — turns "2 rotis with dal" into food log entries
 * 2. generateWeeklyInsight() — writes a personalised weekly coaching summary
 *
 * HOW THIS CONNECTS TO STEPS 1-3:
 * ────────────────────────────────
 * - Uses runWithFallback() (Step 4) to call LLMs
 * - Uses logFoodItem() / logCustomFood() (Step 3) to save parsed foods
 * - Uses nutrition/workout/progress repositories (Step 3) to read weekly data
 * - Uses profile repository (Step 2) to read targets/goals
 * - Uses calculateAdaptiveTDEE() (Step 2 engine) for adaptive TDEE
 *
 * THE AI IS A NEW FRONT DOOR TO EXISTING FUNCTIONS.
 * It does not reinvent meal logging — it parses text into the same
 * format that the manual search flow uses.
 */

import { z } from "zod";
import { runWithFallback } from "@/lib/ai/fallback";
import {
  MEAL_PARSER_SYSTEM_PROMPT,
  WEEKLY_INSIGHT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { logMealFoods } from "@/lib/services/nutrition.service";
import { getDailySummary } from "@/lib/repositories/nutrition.repository";
import { getSessionsByDate } from "@/lib/repositories/workout.repository";
import { getWeightHistory } from "@/lib/repositories/progress.repository";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";
import {
  getInsightForWeek,
  saveInsight,
} from "@/lib/repositories/insight.repository";
import { findFoodCandidates } from "@/lib/repositories/food.repository";
import {
  UserFacingError,
  UpstreamError,
  NotFoundError,
} from "@/lib/utils/errors";
import { localDateStr } from "@/lib/utils/local-date";

// ─────────────────────────────────────────────────────────────
// TYPES & LLM OUTPUT VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Schema for ONE food item in the LLM's response.
 *
 * THE LLM RESPONSE IS A TRUST BOUNDARY — same as user input. LLMs produce
 * plausible text, not guaranteed-correct data: quantity can arrive as the
 * string "two", calories can be hallucinated at 9000/100g. Every numeric
 * field is coerced and clamped to physically plausible ranges BEFORE any
 * database write. (Pure fat is ~900 kcal/100g — nothing edible exceeds it.)
 */
const parsedFoodItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  nameHindi: z.string().max(100).nullish(),
  quantity: z.coerce.number().positive().max(2000), // grams
  unit: z.string().max(20).catch("g"),
  estimatedCaloriesPer100g: z.coerce.number().min(0).max(900),
  estimatedProteinPer100g: z.coerce.number().min(0).max(100),
  estimatedCarbsPer100g: z.coerce.number().min(0).max(100),
  estimatedFatPer100g: z.coerce.number().min(0).max(100),
});

type ParsedFoodItem = z.infer<typeof parsedFoodItemSchema>;

/** Candidate food row shape used by the match ladder */
interface FoodCandidate {
  id: string;
  name: string;
  nameHindi: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  isVerified: boolean;
}

/** Result of attempting to log one parsed item */
interface LoggedItem {
  name: string;
  quantity: number;
  calories: number;
  matched: boolean; // true if matched to food DB, false if custom
}

/** Full result returned to the API route */
export interface MealParseResult {
  logged: LoggedItem[];
  provider: string;
  totalCalories: number;
}

// ─────────────────────────────────────────────────────────────
// MEAL PARSING
// ─────────────────────────────────────────────────────────────

/**
 * Deterministic food match ladder: exact → prefix → substring.
 *
 * WHY NOT findFirst + contains? That returns whichever row the database
 * happens to produce first — nondeterministic. "roti" could resolve to
 * "Roti" today and "Aloo Roti" after a re-seed, giving the same meal text
 * different calories on different days.
 *
 * Tiebreak within a tier is stable: verified foods first, then the
 * SHORTEST name (so the generic "Roti" beats "Aloo Roti"), then alphabetical.
 */
function pickBestMatch(
  item: ParsedFoodItem,
  candidates: FoodCandidate[]
): FoodCandidate | null {
  const name = item.name.toLowerCase();
  const hindi = item.nameHindi?.toLowerCase();

  const tiers: Array<(f: FoodCandidate) => boolean> = [
    (f) =>
      f.name.toLowerCase() === name ||
      (!!hindi && f.nameHindi?.toLowerCase() === hindi),
    (f) =>
      f.name.toLowerCase().startsWith(name) ||
      (!!hindi && !!f.nameHindi?.toLowerCase().startsWith(hindi)),
    (f) =>
      f.name.toLowerCase().includes(name) ||
      (!!hindi && !!f.nameHindi?.toLowerCase().includes(hindi)),
  ];

  for (const matches of tiers) {
    const tier = candidates.filter(matches);
    if (tier.length > 0) {
      tier.sort(
        (a, b) =>
          Number(b.isVerified) - Number(a.isVerified) ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
      );
      return tier[0];
    }
  }
  return null;
}

/**
 * Parse natural language meal text into structured food log entries.
 *
 * FLOW:
 * 1. Send text to LLM with the meal parser system prompt
 * 2. Validate the LLM's JSON against a schema (trust boundary — see above)
 * 3. ONE query fetches candidate foods for ALL parsed names (no N+1)
 * 4. Match in memory with the deterministic ladder
 * 5. ONE transaction writes the whole meal — atomic, no half-logged meals
 */
export async function parseMealText(
  userId: string,
  text: string,
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK",
  date: string
): Promise<MealParseResult> {
  // 1. Call LLM
  const aiResult = await runWithFallback({
    systemPrompt: MEAL_PARSER_SYSTEM_PROMPT,
    userMessage: `Parse this meal: "${text}"`,
  });

  if (!aiResult.ok) {
    // All providers down = upstream failure (502), message already friendly
    throw new UpstreamError(aiResult.error);
  }

  // 2. Parse + validate the LLM response (trust boundary)
  let raw: unknown;
  try {
    raw = JSON.parse(aiResult.text);
  } catch {
    throw new UserFacingError(
      "AI returned invalid JSON. Please try rephrasing your meal."
    );
  }

  const envelope = z.object({ items: z.array(z.unknown()).max(20) }).safeParse(raw);
  if (!envelope.success || envelope.data.items.length === 0) {
    throw new UserFacingError(
      "AI could not identify any foods. Please try again or search manually."
    );
  }

  // Validate items individually: keep the valid ones, drop hallucinated
  // garbage (negative quantities, 9000-kcal foods) instead of failing the
  // whole meal because of one bad item.
  const items = envelope.data.items
    .map((i) => parsedFoodItemSchema.safeParse(i))
    .filter((r) => r.success)
    .map((r) => r.data);

  if (items.length === 0) {
    throw new UserFacingError(
      "AI could not identify any foods. Please try again or search manually."
    );
  }

  // 3. ONE query for all candidate foods (was: one findFirst per item)
  const candidates = (await findFoodCandidates(items)) as FoodCandidate[];

  // 4. Match in memory + compute nutrition rows
  const logged: LoggedItem[] = [];
  const foodRows: Array<{
    foodId: string | null;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }> = [];

  for (const item of items) {
    const matchedFood = pickBestMatch(item, candidates);
    const multiplier = item.quantity / 100;

    // Matched → accurate per-100g data from the DB.
    // Unmatched → the LLM's (schema-clamped) estimates.
    const source = matchedFood ?? {
      id: null,
      name: item.name,
      caloriesPer100g: item.estimatedCaloriesPer100g,
      proteinPer100g: item.estimatedProteinPer100g,
      carbsPer100g: item.estimatedCarbsPer100g,
      fatPer100g: item.estimatedFatPer100g,
    };

    const calories = Math.round(source.caloriesPer100g * multiplier);

    foodRows.push({
      foodId: source.id,
      name: source.name,
      quantity: item.quantity,
      unit: "g",
      calories,
      protein: Math.round(source.proteinPer100g * multiplier * 10) / 10,
      carbs: Math.round(source.carbsPer100g * multiplier * 10) / 10,
      fat: Math.round(source.fatPer100g * multiplier * 10) / 10,
    });

    logged.push({
      name: source.name,
      quantity: item.quantity,
      calories,
      matched: matchedFood !== null,
    });
  }

  // 5. ONE transaction writes the whole meal
  await logMealFoods(userId, { date, mealType, foods: foodRows });

  const totalCalories = logged.reduce((sum, item) => sum + item.calories, 0);

  return {
    logged,
    provider: aiResult.provider,
    totalCalories,
  };
}

// ─────────────────────────────────────────────────────────────
// WEEKLY INSIGHT
// ─────────────────────────────────────────────────────────────

/**
 * Get the Monday of the week containing `localDate` (a "YYYY-MM-DD" string
 * from the CLIENT — the user's own calendar date).
 *
 * TIMEZONE RULE: the server must never compute "today" from its own clock
 * for a user-facing feature. Vercel runs in UTC; for an Indian user opening
 * the app Monday 9 AM IST, the server's clock still says Sunday — the old
 * code served LAST week's insight as "this week" and cached it.
 *
 * The date string is anchored to UTC midnight so the day-of-week arithmetic
 * below is pure calendar math, immune to whatever timezone the server is in.
 * Falls back to the server's local date only when the client sent none.
 */
function getWeekStart(localDate?: string): Date {
  const dateStr =
    localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
      ? localDate
      : localDateStr();
  const monday = new Date(`${dateStr}T00:00:00Z`);
  const day = monday.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Days since Monday
  monday.setUTCDate(monday.getUTCDate() - diff);
  return monday;
}

/**
 * Format a UTC-anchored date as "YYYY-MM-DD".
 *
 * NOTE: toISOString().split("T")[0] is BANNED for wall-clock dates
 * (CONTEXT.md — the July 8 midnight bug). It is correct HERE because every
 * date passed in is already anchored to UTC midnight by getWeekStart() —
 * this is calendar arithmetic, not clock reading.
 */
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Read the cached weekly insight for the current week — WITHOUT generating.
 *
 * WHY THIS EXISTS (separate from generateWeeklyInsight):
 * ─────────────────────────────────────────────────────
 * Reading an already-generated insight from the database is CHEAP and should
 * be unlimited. Generating a NEW one calls the LLM and is EXPENSIVE, so only
 * generation is rate-limited. Keeping "read" and "generate" as two functions
 * lets the API route serve a cached insight to a user who has exhausted their
 * weekly generation quota — instead of blocking them behind a 429.
 *
 * Returns the cached insight, or null if none exists for this week yet.
 */
export async function getCachedWeeklyInsight(userId: string, localDate?: string) {
  const weekStart = getWeekStart(localDate);
  const existing = await getInsightForWeek(userId, weekStart);
  if (!existing) return null;

  return {
    insight: existing.content,
    highlights: (existing.highlights as string[]) ?? [],
    suggestion: existing.suggestion,
    weekStart: formatDate(weekStart),
    provider: existing.provider,
    cached: true,
  };
}

/**
 * Generate a personalised weekly coaching insight.
 *
 * FLOW:
 * 1. Check if insight already exists for this week → return cached
 * 2. Fetch 7 days of nutrition, workout, and weight data
 * 3. Fetch user profile (targets, goal, strictness)
 * 4. Build a context string with all the data
 * 5. Send to LLM with the weekly insight system prompt
 * 6. Save to database (cache for this week)
 * 7. Return the insight
 */
export async function generateWeeklyInsight(userId: string, localDate?: string) {
  const weekStart = getWeekStart(localDate);

  // 1. Check cache — don't regenerate if already exists.
  //
  // KNOWN LIMITATION (cache stampede): two concurrent misses will BOTH call
  // the LLM; saveInsight() upserts on (userId, weekStart) so the writes
  // can't conflict — last one wins. Accepted: generation is rate-limited to
  // 2/week/user, so the worst case is one wasted LLM call, not corruption.
  const existing = await getInsightForWeek(userId, weekStart);
  if (existing) {
    return {
      insight: existing.content,
      highlights: existing.highlights as string[],
      suggestion: existing.suggestion,
      weekStart: formatDate(weekStart),
      provider: existing.provider,
      cached: true,
    };
  }

  // 2. Fetch 7 days of data (UTC calendar math — weekStart is UTC-anchored)
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    days.push(formatDate(d));
  }

  // Parallel fetch — all 7 days of nutrition + workout data + profile + weight
  const [nutritionDays, workoutDays, weightHistory, profile] = await Promise.all([
    Promise.all(days.map((d) => getDailySummary(userId, d))),
    Promise.all(days.map((d) => getSessionsByDate(userId, d))),
    getWeightHistory(userId, 14), // last 2 weeks for trend
    getProfileByUserId(userId),
  ]);

  if (!profile) {
    throw new NotFoundError("Profile not found. Complete onboarding first.");
  }

  // 3. Build context for the LLM
  const daysLogged = nutritionDays.filter((d) => d.totalCalories > 0).length;
  const avgCalories =
    daysLogged > 0
      ? Math.round(
          nutritionDays.reduce((s, d) => s + d.totalCalories, 0) / daysLogged
        )
      : 0;
  const avgProtein =
    daysLogged > 0
      ? Math.round(
          nutritionDays.reduce((s, d) => s + d.totalProtein, 0) / daysLogged
        )
      : 0;

  const totalWorkouts = workoutDays.filter((d) => d.length > 0).length;

  const sortedWeights = [...weightHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const weeklyWeightChange =
    sortedWeights.length >= 2
      ? Math.round(
          (sortedWeights[sortedWeights.length - 1].weightKg -
            sortedWeights[0].weightKg) *
            10
        ) / 10
      : null;

  const contextMessage = `
## User Profile
- Goal: ${profile.goal}
- Target Calories: ${profile.targetCalories} kcal/day
- Target Protein: ${profile.targetProtein}g/day
- Target Carbs: ${profile.targetCarbs}g/day
- Target Fat: ${profile.targetFat}g/day
- Current Weight: ${profile.weightKg}kg
- Strictness: ${profile.strictness}
- Dietary Type: ${profile.dietaryType || "Not specified"}

## This Week's Data (${formatDate(weekStart)} to ${days[6]})
- Days with food logged: ${daysLogged} / 7
- Average daily calories: ${avgCalories} kcal (target: ${profile.targetCalories})
- Average daily protein: ${avgProtein}g (target: ${profile.targetProtein})
- Workout sessions: ${totalWorkouts}
- Weight change this period: ${weeklyWeightChange !== null ? `${weeklyWeightChange > 0 ? "+" : ""}${weeklyWeightChange} kg` : "Not enough weight data"}

## Daily Breakdown
${days
  .map((d, i) => {
    const n = nutritionDays[i];
    const w = workoutDays[i];
    return `${d}: ${n.totalCalories} kcal / ${n.totalProtein}g protein / ${w.length} workout(s)`;
  })
  .join("\n")}

Write a personalised weekly insight for this user.`;

  // 4. Call LLM
  const aiResult = await runWithFallback({
    systemPrompt: WEEKLY_INSIGHT_SYSTEM_PROMPT,
    userMessage: contextMessage,
  });

  if (!aiResult.ok) {
    // aiResult.error is a user-friendly message written by the fallback
    // chain; provider details stay in aiResult.attempts (server logs only).
    throw new UpstreamError(aiResult.error);
  }

  // 5. Parse LLM response
  let insightData: {
    insight: string;
    highlights: string[];
    suggestion: string;
  };

  try {
    insightData = JSON.parse(aiResult.text);
  } catch {
    // If JSON parsing fails, treat the entire response as the insight text
    insightData = {
      insight: aiResult.text,
      highlights: [],
      suggestion: "",
    };
  }

  // 6. Save to database
  const metadata = {
    daysLogged,
    avgCalories,
    avgProtein,
    totalWorkouts,
    weeklyWeightChange,
    targetCalories: profile.targetCalories,
    targetProtein: profile.targetProtein,
  };

  await saveInsight(userId, {
    weekStart,
    content: insightData.insight,
    highlights: insightData.highlights || [],
    suggestion: insightData.suggestion || "",
    provider: aiResult.provider,
    metadata,
  });

  // 7. Return
  return {
    insight: insightData.insight,
    highlights: insightData.highlights || [],
    suggestion: insightData.suggestion || "",
    weekStart: formatDate(weekStart),
    provider: aiResult.provider,
    cached: false,
  };
}
