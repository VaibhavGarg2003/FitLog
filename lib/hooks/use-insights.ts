/**
 * Progress Summary + AI Reports — TanStack Query hooks
 * ═════════════════════════════════════════════════════
 *
 * useProgressSummary(range)  → GET  /api/progress/summary  (numbers, no AI)
 * useInsights()              → GET  /api/insights          (report cards, no AI)
 * useGenerateReport()        → POST /api/insights/generate (the only AI call)
 *
 * Keys include the app's "today" (saved time zone): when the day rolls over
 * — possibly into a new week or month — the next render fetches the right
 * periods instead of serving yesterday's cached cards. Both live under the
 * ["progress"] key family, so anything that changes logged data (a weigh-in,
 * food, a finished workout) marks them stale by invalidating ["progress"] —
 * the charts and the "Outdated" flag follow without a manual refresh.
 *
 * GENERATING (202): another tap/device is already writing that report. The
 * overview is re-polled every 3 s while any card says GENERATING.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserToday } from "@/components/shared/timezone-provider";
import type { InsightsOverview, ReportView } from "@/lib/services/insight.service";
import type { ProgressSummary, SummaryRange } from "@/lib/services/progress-summary.service";

async function getJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export function useProgressSummary(range: SummaryRange) {
  const today = useUserToday();
  return useQuery<ProgressSummary>({
    queryKey: ["progress", "summary", range, today],
    queryFn: async () => getJson(await fetch(`/api/progress/summary?range=${range}`)),
    staleTime: 60 * 1000,
    retry: 0,
  });
}

export const insightsKey = (today: string) => ["progress", "insights", today] as const;

export function useInsights() {
  const today = useUserToday();
  return useQuery<InsightsOverview>({
    queryKey: insightsKey(today),
    queryFn: async () => getJson(await fetch("/api/insights")),
    staleTime: 60 * 1000,
    retry: 0,
    // Poll only while a report is being written somewhere.
    refetchInterval: (query) =>
      query.state.data?.cards.some((c) => c.state === "GENERATING") ? 3000 : false,
  });
}

export type GenerateResponse =
  | { status: "READY"; report: ReportView }
  | { status: "GENERATING" };

export function useGenerateReport() {
  const queryClient = useQueryClient();
  const today = useUserToday();
  return useMutation<GenerateResponse, Error, { type: ReportView["type"]; regenerate?: boolean }>({
    mutationFn: async (vars) =>
      getJson(
        await fetch("/api/insights/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vars),
        })
      ),
    // Success (200) or already-in-progress (202): refetch the cards; a 202
    // leaves a GENERATING card, which polls until the report lands.
    onSettled: () => queryClient.invalidateQueries({ queryKey: insightsKey(today) }),
  });
}
