/**
 * Buddy hooks — TanStack Query
 * ════════════════════════════
 *
 * useSocialProfile()   my @handle, invite code, read-receipt preference (null = not opted in)
 * useClaimHandle()     choose / change my @handle
 * useReadReceipts()    toggle read receipts
 * useRotateInvite()    new invite code (old QR codes stop working)
 * useBuddies()         buddies, incoming + outgoing requests, blocked people
 * useLookupHandle()    exact @handle search
 * useBuddyRequest()    send a request (by handle or invite code)
 * useBuddyRespond()    accept / decline / cancel
 * useRemoveBuddy(), useBlock(), useUnblock(), useReport()
 *
 * Query keys include the user id so a tab that switches account can never
 * show the previous account's buddies from cache. Mutations that WRITE the
 * cache return the account that made the request (`actor`) and write under
 * THAT key: TanStack re-binds a pending mutation's callbacks on re-render,
 * so a closure's userId could already be the next account's when a late
 * response lands (Codex review, 2026-10-09).
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutbox } from "@/lib/offline/outbox-provider";
import { chatFetch } from "@/lib/hooks/chat-api";

export interface MySocialProfile {
  handle: string;
  inviteCode: string;
  readReceipts: boolean;
}

export interface PublicBuddy {
  userId: string;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export type Relationship = "NONE" | "BUDDIES" | "REQUESTED" | "INCOMING";

export interface BuddyOverview {
  buddies: (PublicBuddy & { since: string | null })[];
  incoming: (PublicBuddy & { requestedAt: string })[];
  outgoing: (PublicBuddy & { requestedAt: string })[];
  blocked: PublicBuddy[];
}

export type BuddyOutcome =
  | "REQUESTED"
  | "ALREADY_REQUESTED"
  | "CONNECTED"
  | "ALREADY_CONNECTED"
  | "DECLINED"
  | "CANCELLED"
  | "REMOVED";

export const socialKeys = {
  all: (userId: string) => ["social", userId] as const,
  profile: (userId: string) => ["social", userId, "profile"] as const,
  buddies: (userId: string) => ["social", userId, "buddies"] as const,
};

function useInvalidateSocial() {
  const queryClient = useQueryClient();
  const { userId } = useOutbox();
  return () => {
    queryClient.invalidateQueries({ queryKey: socialKeys.all(userId) });
    // Buddy changes can enable/disable chats.
    queryClient.invalidateQueries({ queryKey: ["chat", userId] });
  };
}

export function useSocialProfile() {
  const { userId } = useOutbox();
  return useQuery({
    queryKey: socialKeys.profile(userId),
    queryFn: async () =>
      (await chatFetch<{ profile: MySocialProfile | null }>(userId, "/api/social/profile"))
        .profile,
    staleTime: 10 * 60 * 1000,
  });
}

/** A profile write, tagged with the account that made it. */
async function writeProfile(
  actor: string,
  path: string,
  init: Parameters<typeof chatFetch>[2]
): Promise<{ actor: string; profile: MySocialProfile }> {
  const { profile } = await chatFetch<{ profile: MySocialProfile }>(actor, path, init);
  return { actor, profile };
}

export function useClaimHandle() {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      writeProfile(userId, "/api/social/profile", { method: "PUT", json: { handle } }),
    onSuccess: ({ actor, profile }) => {
      queryClient.setQueryData(socialKeys.profile(actor), profile);
      queryClient.invalidateQueries({ queryKey: socialKeys.buddies(actor) });
    },
  });
}

export function useReadReceipts() {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readReceipts: boolean) =>
      writeProfile(userId, "/api/social/profile", { method: "PATCH", json: { readReceipts } }),
    onSuccess: ({ actor, profile }) => {
      queryClient.setQueryData(socialKeys.profile(actor), profile);
      queryClient.invalidateQueries({ queryKey: ["chat", actor] });
    },
  });
}

export function useRotateInvite() {
  const { userId } = useOutbox();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => writeProfile(userId, "/api/social/profile/invite", { method: "POST" }),
    onSuccess: ({ actor, profile }) => queryClient.setQueryData(socialKeys.profile(actor), profile),
  });
}

export function useBuddies(enabled = true) {
  const { userId } = useOutbox();
  return useQuery({
    queryKey: socialKeys.buddies(userId),
    queryFn: () => chatFetch<BuddyOverview>(userId, "/api/buddies"),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useLookupHandle() {
  const { userId } = useOutbox();
  return useMutation({
    mutationFn: (handle: string) =>
      chatFetch<{ user: PublicBuddy; relationship: Relationship }>(
        userId,
        `/api/social/lookup?handle=${encodeURIComponent(handle)}`
      ),
  });
}

export function useBuddyRequest() {
  const { userId } = useOutbox();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (input: { handle: string } | { inviteCode: string }) =>
      chatFetch<{ outcome: BuddyOutcome; user: PublicBuddy }>(userId, "/api/buddies/requests", {
        method: "POST",
        json: input,
      }),
    onSuccess: invalidate,
  });
}

export function useBuddyRespond() {
  const { userId } = useOutbox();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (input: { userId: string; action: "accept" | "decline" | "cancel" }) =>
      chatFetch<{ outcome: BuddyOutcome }>(
        userId,
        `/api/buddies/${encodeURIComponent(input.userId)}`,
        { method: "POST", json: { action: input.action } }
      ),
    onSuccess: invalidate,
  });
}

export function useRemoveBuddy() {
  const { userId } = useOutbox();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (otherId: string) =>
      chatFetch(userId, `/api/buddies/${encodeURIComponent(otherId)}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useBlock() {
  const { userId } = useOutbox();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (otherId: string) =>
      chatFetch(userId, "/api/blocks", { method: "POST", json: { userId: otherId } }),
    onSuccess: invalidate,
  });
}

export function useUnblock() {
  const { userId } = useOutbox();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: (otherId: string) =>
      chatFetch(userId, `/api/blocks/${encodeURIComponent(otherId)}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export type ReportReason = "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";

export function useReport() {
  const { userId } = useOutbox();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      messageId?: string;
      reason: ReportReason;
      details?: string;
    }) => chatFetch<{ id: string }>(userId, "/api/reports", { method: "POST", json: input }),
  });
}
