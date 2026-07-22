/**
 * Share Hooks — TanStack Query
 * ═════════════════════════════
 *
 * useCreateShare()  — share a template → returns { slug }
 * useMyShares()     — list my share links
 * useRevokeShare()  — revoke a link
 * useCopyShare()    — import a shared plan into my account (from /s/[slug])
 *
 * All hit same-origin Next.js API routes, which proxy to Django.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface MyShareLink {
  slug: string;
  kind: string;
  title: string;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
}

const SHARES_KEY = ["share", "mine"] as const;

/** The public origin, for building the shareable URL to copy/send. */
export function shareUrl(slug: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/s/${slug}`;
  }
  return `/s/${slug}`;
}

export function useMyShares(enabled = true) {
  return useQuery<MyShareLink[]>({
    queryKey: SHARES_KEY,
    queryFn: async () => {
      const res = await fetch("/api/share");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load shared links");
      return data.links ?? [];
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();
  return useMutation<{ slug: string }, Error, { templateId: string; title?: string }>({
    mutationFn: async (input) => {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create share link");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARES_KEY });
    },
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (slug) => {
      const res = await fetch(`/api/share/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke link");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHARES_KEY });
    },
  });
}

export function useCopyShare() {
  const queryClient = useQueryClient();
  return useMutation<
    { copied: boolean; templateId: string; name: string },
    Error,
    string
  >({
    mutationFn: async (slug) => {
      const res = await fetch(`/api/share/${encodeURIComponent(slug)}/copy`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to copy plan");
      return data;
    },
    onSuccess: () => {
      // The copied template now shows in the user's template list.
      queryClient.invalidateQueries({ queryKey: ["workout", "templates"] });
    },
  });
}
