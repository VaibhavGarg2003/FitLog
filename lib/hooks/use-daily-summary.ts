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
    // 2 minutes. The old 30s meant every page revisit after half a minute
    // refetched — a needless request, because logging food already invalidates
    // this exact key (useLogFood/useDeleteFood), so the cache is kept fresh by
    // the write path, not by a short timer.
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
