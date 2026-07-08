/**
 * useExercises — Exercise Database Hook
 * ═════════════════════════════════════
 *
 * Fetches exercises with optional filtering by muscle group,
 * category, or search query. Used by the workout logging feature.
 */

"use client";

import { useQuery } from "@tanstack/react-query";

interface Exercise {
  id: string;
  name: string;
  category: "COMPOUND" | "ISOLATION" | "CARDIO";
  muscleGroup: string;
  equipment: string | null;
  metValue: number;
  isCompound: boolean;
  instructions: string | null;
}

interface UseExercisesOptions {
  muscleGroup?: string;
  category?: string;
  query?: string;
}

async function fetchExercises(
  options: UseExercisesOptions
): Promise<Exercise[]> {
  const params = new URLSearchParams();
  if (options.muscleGroup) params.set("muscle", options.muscleGroup);
  if (options.category) params.set("category", options.category);
  if (options.query) params.set("q", options.query);

  const res = await fetch(`/api/exercises?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch exercises");
  const data = await res.json();
  return data.exercises;
}

export function useExercises(options: UseExercisesOptions = {}) {
  return useQuery({
    queryKey: ["exercises", options],
    queryFn: () => fetchExercises(options),
    staleTime: 10 * 60 * 1000, // 10 minutes — exercise data never changes
  });
}
