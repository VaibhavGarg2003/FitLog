/**
 * Daily Summary Hook — TanStack Query
 * ════════════════════════════════════
 *
 * Fetches daily nutrition totals (calories, protein, carbs, fat)
 * for the selected date. Used by the dashboard calorie ring and macro bars.
 *
 * Cache: 30 seconds (changes frequently as user logs meals)
 * Key: ["nutrition", "daily", date] — cache is per-date
 */

"use client";

import { useQuery } from "@tanstack/react-query";

interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export function useDailySummary(date: string) {
  return useQuery<DailySummary>({
    queryKey: ["nutrition", "daily", date],
    queryFn: async () => {
      const res = await fetch(`/api/nutrition/daily?date=${date}`);
      if (!res.ok) throw new Error("Failed to fetch daily summary");
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds — refreshes often during active logging
    retry: 1,
  });
}
