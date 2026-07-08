/**
 * Workout Hooks — TanStack Query
 * ═══════════════════════════════
 *
 * useWorkoutsForDate() — fetches sessions for a date
 * useStartSession()    — mutation to start a new session
 * useLogSet()          — mutation to add a set to a session
 * useFinishSession()   — mutation to complete a session (calculates burn)
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useWorkoutsForDate(date: string) {
  return useQuery({
    queryKey: ["workout", "sessions", date],
    queryFn: async () => {
      const res = await fetch(`/api/workout?date=${date}`);
      if (!res.ok) throw new Error("Failed to fetch workouts");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useStartSession(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      mode: "LIVE" | "RECALL";
      splitType?: string;
    }) => {
      const res = await fetch("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, date }),
      });
      if (!res.ok) throw new Error("Failed to start session");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
    },
  });
}

export function useLogSet(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sessionId: string;
      exerciseId: string;
      setNumber: number;
      weight?: number;
      reps?: number;
      rpe?: number;
      isWarmup?: boolean;
    }) => {
      const { sessionId, ...setData } = data;
      const res = await fetch(`/api/workout/${sessionId}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setData),
      });
      if (!res.ok) throw new Error("Failed to add set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
    },
  });
}

export function useFinishSession(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sessionId: string;
      durationMin: number;
      rpe?: number;
      notes?: string;
    }) => {
      const { sessionId, ...finishData } = data;
      const res = await fetch(`/api/workout/${sessionId}/sets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finishData),
      });
      if (!res.ok) throw new Error("Failed to finish session");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] });
    },
  });
}
