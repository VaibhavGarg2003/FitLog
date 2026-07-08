/**
 * Progress Hooks — TanStack Query
 * ════════════════════════════════
 *
 * useProgressData() — fetches weight history + progress stats
 * useLogWeight()    — mutation to log today's weight
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ProgressData {
  history: { date: string; weightKg: number; notes?: string }[];
  currentWeight: number | null;
  startWeight: number | null;
  totalChange: number | null;
  logCount: number;
  canUseAdaptiveTDEE: boolean;
  activeGoal: {
    targetValue: number;
    targetDate: string;
    startValue: number;
    startDate: string;
  } | null;
}

export function useProgressData() {
  return useQuery<ProgressData>({
    queryKey: ["progress", "weight"],
    queryFn: async () => {
      const res = await fetch("/api/progress/weight");
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    staleTime: 60 * 1000, // 1 minute — weight doesn't change frequently
  });
}

export function useLogWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      weightKg: number;
      date?: string;
      notes?: string;
    }) => {
      const res = await fetch("/api/progress/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to log weight");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress", "weight"] });
    },
  });
}
