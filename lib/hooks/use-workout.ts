/**
 * Workout Hooks — TanStack Query
 * ═══════════════════════════════
 *
 * useWorkoutsForDate() — fetches sessions for a date
 * useStartSession()    — mutation to start a new session
 * useLogSet()          — mutation to add a set to a session
 * useFinishSession()   — mutation to complete a session (calculates burn)
 *
 * SET MUTATIONS RETURN THEIR INVALIDATION:
 * ────────────────────────────────────────
 * useLogSet / useUpdateSet / useDeleteSet `return` the invalidateQueries
 * promise from onSuccess, so `mutateAsync` only resolves once the sessions
 * query has REFETCHED. The workout page derives "Set N" and the session set
 * count straight from that query, so resolving early would leave the logger
 * one set behind (and, after a delete, offering a set number the server had
 * just renumbered away).
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
      clientRequestId: string;
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] }),
  });
}

export function useUpdateSet(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sessionId: string;
      setId: string;
      weight?: number;
      reps?: number;
      rpe?: number | null;
      isWarmup?: boolean;
    }) => {
      const { sessionId, ...patch } = data;
      const res = await fetch(`/api/workout/${sessionId}/sets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update set");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] }),
  });
}

export function useDeleteSet(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { sessionId: string; setId: string }) => {
      const res = await fetch(`/api/workout/${data.sessionId}/sets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: data.setId }),
      });
      if (!res.ok) throw new Error("Failed to delete set");
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] }),
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
      // A newly COMPLETED session must appear in the Progress page's
      // "Recent Workouts" card immediately — invalidate its cache too.
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

/**
 * Discard an active workout (soft-cancel on the server).
 *
 * Previously "Discard workout" only cleared local React state, so the row
 * stayed IN_PROGRESS forever and reappeared as an unfinished session. This
 * makes the discard real.
 */
export function useCancelSession(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { sessionId: string }) => {
      const res = await fetch(`/api/workout/${data.sessionId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to discard workout");
      return res.json();
    },
    // onSettled, not onSuccess: if the discard FAILED the session is still
    // IN_PROGRESS, and refetching is what makes the UI tell the truth — the
    // workout reappears as unfinished instead of silently looking discarded.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["workout", "sessions", date] }),
  });
}
