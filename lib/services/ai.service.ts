/**
 * AI Service — Business Logic for AI Features
 * ═════════════════════════════════════════════
 *
 * parseMealText() — turns "2 rotis with dal" into food log entries.
 *
 * (The weekly insight that used to live here was replaced by the period
 * reports in lib/services/insight.service.ts.)
 *
 * HOW THIS CONNECTS TO STEPS 1-3:
 * ────────────────────────────────
 * - Uses runWithFallback() (Step 4) to call LLMs
 * - Uses logFoodItem() / logCustomFood() (Step 3) to save parsed foods
 *
 * THE AI IS A NEW FRONT DOOR TO EXISTING FUNCTIONS.
 * It does not reinvent meal logging — it parses text into the same
 * format that the manual search flow uses.
 */

import { z } from "zod";
import { runWithFallback } from "@/lib/ai/fallback";
import { MEAL_PARSER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { logMealFoods } from "@/lib/services/nutrition.service";
import { findFoodCandidates } from "@/lib/repositories/food.repository";
import { UserFacingError, UpstreamError } from "@/lib/utils/errors";

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
