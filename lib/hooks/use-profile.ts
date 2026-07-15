/**
 * useProfile — TanStack Query Hook for User Profile
 * ══════════════════════════════════════════════════
 *
 * WHAT IS A TANSTACK QUERY HOOK?
 * ──────────────────────────────
 * Instead of manually writing:
 *   useState + useEffect + fetch + loading + error + retry + cache
 *
 * TanStack Query does it all in one line:
 *   const { data, isLoading, error } = useProfile();
 *
 * It also:
 * - Caches the result (won't re-fetch for 2 minutes)
 * - Auto-retries on network failure
 * - Shows stale data while refreshing in the background
 * - Deduplicates requests (10 components using useProfile()
 *   only triggers ONE API call)
 */

"use client";

import { useQuery } from "@tanstack/react-query";

interface Profile {
  id: string;
  userId: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  sex: string | null;
  activityLevel: string | null;
  goal: string | null;
  dietaryType: string | null;
  tdee: number | null;
  targetCalories: number | null;
  targetProtein: number | null;
  targetCarbs: number | null;
  targetFat: number | null;
  strictness: string;
  unitSystem: string;
  isOnboarded: boolean;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  // Active weight goal (null when the user skipped or picked Maintain).
  activeGoal?: {
    id: string;
    type: string;
    startValue: number;
    targetValue: number;
    startDate: string;
    targetDate: string;
    status: string;
  } | null;
}

async function fetchProfile(): Promise<Profile> {
  const res = await fetch("/api/profile");
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch profile");
  }
  return res.json();
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 2 * 60 * 1000, // 2 minutes — profile rarely changes
    retry: 1, // Retry once on failure, then show error
  });
}
