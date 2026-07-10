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

import { runWithFallback } from "@/lib/ai/fallback";
import {
  MEAL_PARSER_SYSTEM_PROMPT,
  WEEKLY_INSIGHT_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import { logFoodItem, logCustomFood } from "@/lib/services/nutrition.service";
import { getDailySummary } from "@/lib/repositories/nutrition.repository";
import { getSessionsByDate } from "@/lib/repositories/workout.repository";
import { getWeightHistory } from "@/lib/repositories/progress.repository";
import { getProfileByUserId } from "@/lib/repositories/profile.repository";
import {
  getInsightForWeek,
  saveInsight,
} from "@/lib/repositories/insight.repository";
import { prisma } from "@/lib/supabase/prisma";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/** A single food item parsed by the LLM */
interface ParsedFoodItem {
  name: string;
  nameHindi?: string | null;
  quantity: number; // in grams
  unit: string;
  estimatedCaloriesPer100g: number;
  estimatedProteinPer100g: number;
  estimatedCarbsPer100g: number;
  estimatedFatPer100g: number;
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
 * Parse natural language meal text into structured food log entries.
 *
 * FLOW:
 * 1. Send text to LLM with the meal parser system prompt
 * 2. LLM returns JSON array of food items with gram quantities
 * 3. For each item, try to match against the food database
 * 4. Matched items → logFoodItem() (accurate per-100g data from DB)
 * 5. Unmatched items → logCustomFood() (LLM's estimated nutrition)
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
    throw new Error(aiResult.error);
  }

  // 2. Parse LLM JSON response
  let parsed: { items: ParsedFoodItem[] };
  try {
    parsed = JSON.parse(aiResult.text);
  } catch {
    throw new Error("AI returned invalid JSON. Please try rephrasing your meal.");
  }

  if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("AI could not identify any foods. Please try again or search manually.");
  }

  // 3. Process each item
  const logged: LoggedItem[] = [];

  for (const item of parsed.items) {
    // Skip items with zero or negative quantities
    if (!item.quantity || item.quantity <= 0) continue;

    // Try to match against our food database (case-insensitive name search)
    const matchedFood = await prisma.food.findFirst({
      where: {
        OR: [
          { name: { contains: item.name, mode: "insensitive" } },
          ...(item.nameHindi
            ? [{ nameHindi: { contains: item.nameHindi, mode: "insensitive" as const } }]
            : []),
        ],
      },
    });

    if (matchedFood) {
      // ── MATCHED: Use accurate DB nutrition data ──
      // This path calls logFoodItem() from Step 3 nutrition service
      // which calculates from per-100g data × quantity
      await logFoodItem(userId, {
        date,
        mealType,
        foodId: matchedFood.id,
        quantityGrams: item.quantity,
        isRestaurant: false,
      });

      const multiplier = item.quantity / 100;
      logged.push({
        name: matchedFood.name,
        quantity: item.quantity,
        calories: Math.round(matchedFood.caloriesPer100g * multiplier),
        matched: true,
      });
    } else {
      // ── UNMATCHED: Use LLM's estimated nutrition ──
      // This path calls logCustomFood() from Step 3 nutrition service
      const multiplier = item.quantity / 100;
      const calories = Math.round(item.estimatedCaloriesPer100g * multiplier);
      const protein = Math.round(item.estimatedProteinPer100g * multiplier * 10) / 10;
      const carbs = Math.round(item.estimatedCarbsPer100g * multiplier * 10) / 10;
      const fat = Math.round(item.estimatedFatPer100g * multiplier * 10) / 10;

      await logCustomFood(userId, {
        date,
        mealType,
        name: item.name,
        quantity: item.quantity,
        unit: "g",
        calories,
        protein,
        carbs,
        fat,
      });

      logged.push({
        name: item.name,
        quantity: item.quantity,
        calories,
        matched: false,
      });
    }
  }

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
 * Get the Monday of the current week.
 * Used as the weekStart key for caching insights.
 */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Days since Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Format a date as YYYY-MM-DD string.
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
export async function getCachedWeeklyInsight(userId: string) {
  const weekStart = getWeekStart();
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
export async function generateWeeklyInsight(userId: string) {
  const weekStart = getWeekStart();

  // 1. Check cache — don't regenerate if already exists
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

  // 2. Fetch 7 days of data
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
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
    throw new Error("Profile not found. Complete onboarding first.");
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
    throw new Error(aiResult.error);
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
