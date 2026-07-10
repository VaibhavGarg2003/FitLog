/**
 * Weekly Insight Hooks — Read + Generate (split on purpose)
 * ══════════════════════════════════════════════════════════
 *
 * useWeeklyInsight()          → GET  /api/ai/weekly-insight (read cached, unlimited)
 * useGenerateWeeklyInsight()  → POST /api/ai/weekly-insight (LLM call, rate-limited)
 *
 * WHY SPLIT (the fix):
 * ────────────────────
 * Reading is cheap and safe to run on every page mount. Generating costs an
 * LLM call and is capped at 2/week. Keeping them separate means visiting the
 * Progress page shows your existing insight for free, and the LLM only runs
 * when you explicitly click "Generate" — never silently on mount.
 *
 * retry: 0 — a rate-limit (429) or error must NEVER auto-retry. The old hook
 * used retry: 1, which is exactly why the network tab showed the call twice.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WeeklyInsightData {
  /** false = no insight generated for this week yet (show the Generate button) */
  generated: boolean;
  insight?: string;
  highlights?: string[];
  suggestion?: string;
  weekStart?: string;
  provider?: string;
  cached?: boolean;
}

const QUERY_KEY = ["ai", "weekly-insight"] as const;

/**
 * Read this week's cached insight. Safe to call on mount — it never generates.
 */
export function useWeeklyInsight() {
  return useQuery<WeeklyInsightData>({
    queryKey: QUERY_KEY,
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
    // Never retry: a read that fails shouldn't hammer the endpoint.
    retry: 0,
  });
}

/**
 * Generate (or regenerate) this week's insight. Call this from a button click.
 * On success, primes the read-query cache so the card updates instantly.
 */
export function useGenerateWeeklyInsight() {
  const queryClient = useQueryClient();

  return useMutation<WeeklyInsightData, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/ai/weekly-insight", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // Surfaces the 429 "limit reached" message to the card.
        throw new Error(data.error || "Failed to generate weekly insight");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });
}
