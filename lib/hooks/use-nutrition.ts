/**
 * Nutrition Hooks — TanStack Query
 * ═════════════════════════════════
 *
 * useMealsForDate() — fetches all meals for a date (nutrition page)
 * useLogFood()      — mutation to log a food item
 * useDeleteFood()   — mutation to remove a food item
 *
 * Both mutations invalidate the daily summary cache on success,
 * so the dashboard calorie ring updates automatically.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface MealFood {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isRestaurant: boolean;
  food?: {
    id: string;
    name: string;
    nameHindi?: string;
    defaultUnit: string;
    defaultGrams: number;
  };
}

interface MealEntry {
  id: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  mealFoods: MealFood[];
}

export function useMealsForDate(date: string) {
  return useQuery<MealEntry[]>({
    queryKey: ["nutrition", "meals", date],
    queryFn: async () => {
      const res = await fetch(`/api/nutrition/daily?date=${date}&full=true`);
      if (!res.ok) throw new Error("Failed to fetch meals");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useLogFood(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      foodId?: string;
      date: string;
      mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
      quantityGrams?: number;
      isRestaurant?: boolean;
      // Custom food fields
      name?: string;
      quantity?: number;
      unit?: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    }) => {
      const res = await fetch("/api/nutrition/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to log food");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate both the meal list and daily summary caches
      // This makes the dashboard calorie ring update automatically
      queryClient.invalidateQueries({ queryKey: ["nutrition", "meals", date] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "daily", date] });
    },
  });
}

export function useDeleteFood(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mealFoodId: string) => {
      const res = await fetch("/api/nutrition/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealFoodId }),
      });
      if (!res.ok) throw new Error("Failed to delete food");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nutrition", "meals", date] });
      queryClient.invalidateQueries({ queryKey: ["nutrition", "daily", date] });
    },
  });
}
