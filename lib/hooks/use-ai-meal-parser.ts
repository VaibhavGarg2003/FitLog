/**
 * AI Meal Parser Hook — Client-Side Mutation
 * ═══════════════════════════════════════════
 *
 * HOW IT CONNECTS:
 * ────────────────
 * This hook → POST /api/ai/parse-meal → ai.service.parseMealText()
 * → runWithFallback() → Gemini/Groq/OpenRouter
 * → logFoodItem()/logCustomFood() (Step 3)
 *
 * CACHE INVALIDATION:
 * ───────────────────
 * After AI logs foods, it invalidates the same cache keys as manual logging:
 * - ["nutrition", "meals", date] → meal sections refresh
 * - ["nutrition", "daily", date] → calorie ring refreshes
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ParseMealInput {
  text: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  date: string;
}

interface LoggedItem {
  name: string;
  quantity: number;
  calories: number;
  matched: boolean;
}

interface ParseMealResult {
  logged: LoggedItem[];
  provider: string;
  totalCalories: number;
}

export function useAIMealParser(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ParseMealInput): Promise<ParseMealResult> => {
      const res = await fetch("/api/ai/parse-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI parsing failed");
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate the same caches as manual food logging (Step 3 pattern)
      // This ensures the CalorieRing, MacroBars, and MealSections all
      // update immediately after AI logs food.
      queryClient.invalidateQueries({
        queryKey: ["nutrition", "meals", date],
      });
      queryClient.invalidateQueries({
        queryKey: ["nutrition", "daily", date],
      });
    },
  });
}
