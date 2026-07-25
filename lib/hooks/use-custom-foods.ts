/**
 * Custom Food Hooks — TanStack Query
 * ═══════════════════════════════════
 *
 * useCustomFoods()      — list the user's saved foods
 * useSaveCustomFood()   — create or replace one by name
 * useDeleteCustomFood() — remove one
 *
 * All three invalidate the food SEARCH cache as well as the list, because a
 * saved food has to appear in search results immediately — that is the whole
 * point of saving it. Search results are cached per query string, so the
 * invalidation is on the ["foods", "search"] prefix rather than one key.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CustomFood {
  id: string;
  name: string;
  category: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: string;
  defaultGrams: number;
}

export interface CustomFoodInput {
  name: string;
  category?: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  defaultUnit?: string;
  defaultGrams?: number;
}

export function useCustomFoods() {
  return useQuery<CustomFood[]>({
    queryKey: ["foods", "custom"],
    queryFn: async () => {
      const res = await fetch("/api/foods/custom");
      if (!res.ok) throw new Error("Failed to load your saved foods");
      const data = await res.json();
      return data.foods;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Invalidate the list AND every cached search query. */
function invalidateFoodCaches(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["foods", "custom"] }),
    queryClient.invalidateQueries({ queryKey: ["foods", "search"] }),
  ]);
}

export function useSaveCustomFood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CustomFoodInput): Promise<CustomFood> => {
      const res = await fetch("/api/foods/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save your food");
      }
      const body = await res.json();
      return body.food;
    },
    onSuccess: () => invalidateFoodCaches(queryClient),
  });
}

export function useDeleteCustomFood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/foods/custom/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not delete your food");
      return res.json();
    },
    onSuccess: () => invalidateFoodCaches(queryClient),
  });
}
