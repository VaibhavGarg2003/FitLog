/**
 * Weekly Insight Hook — Client-Side Query
 * ════════════════════════════════════════
 *
 * Fetches the weekly AI coaching insight.
 * Uses a very long staleTime (24 hours) because the insight
 * only changes once per week.
 *
 * HOW IT CONNECTS:
 * ────────────────
 * This hook → GET /api/ai/weekly-insight → ai.service.generateWeeklyInsight()
 * → reads 7 days of nutrition/workout/weight data (Step 3 repositories)
 * → calls runWithFallback() → Gemini/Groq/OpenRouter
 * → saves to WeeklyInsight table → returns text
 */

"use client";

import { useQuery } from "@tanstack/react-query";

interface WeeklyInsightData {
  insight: string;
  highlights: string[];
  suggestion: string;
  weekStart: string;
  provider: string;
  cached: boolean;
}

export function useWeeklyInsight() {
  return useQuery<WeeklyInsightData>({
    queryKey: ["ai", "weekly-insight"],
    queryFn: async () => {
      const res = await fetch("/api/ai/weekly-insight");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load weekly insight");
      }

      return data;
    },
    // 24 hours — the insight doesn't change once generated for a week
    staleTime: 24 * 60 * 60 * 1000,
    // Don't auto-fetch on mount — only when user triggers it
    // or when the progress page mounts
    retry: 1,
  });
}
