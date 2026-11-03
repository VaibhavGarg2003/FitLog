"use client";

/**
 * Invite landing (/buddies/invite/[code]) — "Add @rahul_lifts as a buddy?"
 *
 * Opening the link changes nothing: connecting needs a deliberate tap (POST).
 * A visitor without a buddy name picks one first.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBuddyRequest, useSocialProfile, type PublicBuddy, type Relationship } from "@/lib/hooks/use-social";
import { useStartConversation } from "@/lib/hooks/use-chat";
import { BuddyAvatar, displayName } from "@/components/chat/avatar";
import { HandleSetup } from "@/components/chat/handle-setup";

export function InviteAccept({
  code,
  owner,
  relationship,
  isSelf,
}: {
  code: string;
  owner: PublicBuddy;
  relationship: Relationship;
  isSelf: boolean;
}) {
  const router = useRouter();
  const profile = useSocialProfile();
  const request = useBuddyRequest();
  const start = useStartConversation();
  const connected = relationship === "BUDDIES" || request.data?.outcome === "CONNECTED" || request.data?.outcome === "ALREADY_CONNECTED";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-4">
        <BuddyAvatar
          name={owner.name}
          handle={owner.handle}
          avatarUrl={owner.avatarUrl}
          size={72}
          className="mx-auto"
        />
        <div>
          <p className="text-lg font-semibold text-text-primary">{displayName(owner)}</p>
          {owner.handle && <p className="text-sm text-text-muted">@{owner.handle}</p>}
        </div>

        {isSelf ? (
          <p className="text-sm text-text-secondary">This is your own invite. Share it with a friend.</p>
        ) : profile.isLoading ? (
          <div className="h-10 animate-pulse rounded-xl bg-surface-elevated" />
        ) : !profile.data ? (
          <p className="text-sm text-text-secondary">Pick your buddy name below to connect.</p>
        ) : connected ? (
          <div className="space-y-3">
            <p className="text-sm text-primary">You’re buddies now 🎉</p>
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate(owner.userId, { onSuccess: (id) => router.push(`/chat/${id}`) })}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              Send a message
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">wants to be your gym buddy.</p>
            <button
              type="button"
              disabled={request.isPending}
              onClick={() => request.mutate({ inviteCode: code })}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {request.isPending ? "Adding…" : "Add as buddy"}
            </button>
            {request.error && <p className="text-xs text-danger">{request.error.message}</p>}
          </div>
        )}
      </div>

      {!isSelf && !profile.isLoading && !profile.data && <HandleSetup compact />}

      <p className="text-center text-sm">
        <Link href="/buddies" className="text-primary hover:underline">
          Go to Buddies
        </Link>
      </p>
    </div>
  );
}
