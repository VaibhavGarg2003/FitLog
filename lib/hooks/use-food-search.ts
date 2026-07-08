/**
 * useFoodSearch — Debounced Food Search Hook
 * ═══════════════════════════════════════════
 *
 * DEBOUNCING:
 * ───────────
 * When user types "rot" to search for "Roti", we don't want to send
 * 3 API requests ("r", "ro", "rot"). We wait 300ms after the user
 * STOPS typing, then send one request with the final query.
 *
 * This saves API calls and reduces database load.
 *
 * HOW TANSTACK HANDLES THIS:
 * ──────────────────────────
 * We use `enabled: query.length >= 2` — the query only runs
 * when the search term is at least 2 characters. Combined with
 * the component's debounce, this is very efficient.
 */

"use client";

import { useQuery } from "@tanstack/react-query";

interface FoodResult {
  id: string;
  name: string;
  nameHindi: string | null;
  category: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: string;
  defaultQuantity: number;
  defaultGrams: number;
  restaurantMultiplier: number;
  source: string;
}

async function searchFoods(query: string): Promise<FoodResult[]> {
  const res = await fetch(
    `/api/foods/search?q=${encodeURIComponent(query)}&limit=20`
  );
  if (!res.ok) throw new Error("Failed to search foods");
  const data = await res.json();
  return data.foods;
}

export function useFoodSearch(query: string) {
  return useQuery({
    queryKey: ["foods", "search", query],
    queryFn: () => searchFoods(query),
    enabled: query.length >= 2, // Don't search for single characters
    staleTime: 5 * 60 * 1000, // Cache food search for 5 min (food data is static)
    placeholderData: (previousData) => previousData, // Keep old results while new ones load
  });
}
