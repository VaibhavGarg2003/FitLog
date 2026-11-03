"use client";

/**
 * Buddies (/buddies) — three tabs:
 *   Buddies   accepted buddies → Message
 *   Requests  incoming (Accept / Decline) and outgoing (Cancel)
 *   Add       exact @handle search, plus my QR code / invite link
 *
 * An invite link (/buddies/invite/<code>) connects instantly when opened by
 * a signed-in user who taps "Add" — sharing it is consent. "New link" makes
 * every old QR code and link stop working.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AtSign, Copy, MessageCircle, RefreshCw, Search, Share2 } from "lucide-react";
import {
  useBuddies,
  useBuddyRequest,
  useBuddyRespond,
  useLookupHandle,
  useRotateInvite,
  useSocialProfile,
  type PublicBuddy,
  type Relationship,
} from "@/lib/hooks/use-social";
import { useStartConversation } from "@/lib/hooks/use-chat";
import { BuddyAvatar, displayName } from "@/components/chat/avatar";
import { HandleSetup } from "@/components/chat/handle-setup";
import { cn } from "@/lib/utils/cn";

type Tab = "buddies" | "requests" | "add";

export function inviteUrl(code: string) {
  return `${window.location.origin}/buddies/invite/${code}`;
}

function PersonRow({ user, children }: { user: PublicBuddy; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <BuddyAvatar name={user.name} handle={user.handle} avatarUrl={user.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{displayName(user)}</p>
        {user.handle && <p className="truncate text-xs text-text-muted">@{user.handle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

const btn = {
  primary:
    "rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-background hover:bg-primary-hover disabled:opacity-50",
  ghost:
    "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50",
};

function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const start = useStartConversation();
  return (
    <button
      type="button"
      disabled={start.isPending}
      onClick={() =>
        start.mutate(userId, { onSuccess: (id) => router.push(`/chat/${id}`) })
      }
      className={cn(btn.primary, "flex items-center gap-1.5")}
    >
      <MessageCircle size={14} />
      Message
    </button>
  );
}

function AddTab({ inviteCode }: { inviteCode: string }) {
  const lookup = useLookupHandle();
  const request = useBuddyRequest();
  const respond = useBuddyRespond();
  const rotate = useRotateInvite();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [relationship, setRelationship] = useState<Relationship | null>(null);

  const handle = query.trim().replace(/^@+/, "").toLowerCase();
  const found = lookup.data?.user;
  const rel = relationship ?? lookup.data?.relationship ?? null;
  const link = typeof window === "undefined" ? "" : inviteUrl(inviteCode);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Find by buddy name
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (handle.length < 3) return;
            setRelationship(null);
            request.reset();
            lookup.mutate(handle);
          }}
        >
          <div className="relative flex-1">
            <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="their_name"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-label="Buddy name"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            aria-label="Search"
            disabled={handle.length < 3 || lookup.isPending}
            className="rounded-xl bg-surface-elevated px-3 text-text-primary border border-border disabled:opacity-50"
          >
            <Search size={18} />
          </button>
        </form>
        <p className="text-xs text-text-muted">Type their exact buddy name.</p>

        {lookup.error && <p className="text-sm text-text-secondary">{lookup.error.message}</p>}
        {found && (
          <div className="rounded-xl border border-border">
            <PersonRow user={found}>
              {rel === "BUDDIES" ? (
                <MessageButton userId={found.userId} />
              ) : rel === "REQUESTED" ? (
                <span className="text-xs text-text-muted">Requested</span>
              ) : rel === "INCOMING" ? (
                <button
                  type="button"
                  className={btn.primary}
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate(
                      { userId: found.userId, action: "accept" },
                      { onSuccess: () => setRelationship("BUDDIES") }
                    )
                  }
                >
                  Accept
                </button>
              ) : (
                <button
                  type="button"
                  className={btn.primary}
                  disabled={request.isPending}
                  onClick={() =>
                    request.mutate(
                      { handle: found.handle ?? handle },
                      {
                        onSuccess: (r) =>
                          setRelationship(r.outcome === "CONNECTED" ? "BUDDIES" : "REQUESTED"),
                      }
                    )
                  }
                >
                  Add buddy
                </button>
              )}
            </PersonRow>
            {request.error && (
              <p className="px-4 pb-3 text-xs text-danger">{request.error.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Your invite
        </h2>
        <p className="text-sm text-text-secondary">
          At the gym? Let a friend scan this with their phone camera. Anyone with this code
          becomes your buddy instantly.
        </p>
        <div className="flex justify-center">
          <div className="rounded-2xl bg-white p-3">
            {link && <QRCodeSVG value={link} size={168} level="M" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(btn.ghost, "flex items-center gap-1.5")}
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy size={14} /> {copied ? "Copied" : "Copy link"}
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              className={cn(btn.ghost, "flex items-center gap-1.5")}
              onClick={() =>
                navigator.share({ title: "Be my FitLog buddy", url: link }).catch(() => {})
              }
            >
              <Share2 size={14} /> Share
            </button>
          )}
          <button
            type="button"
            className={cn(btn.ghost, "flex items-center gap-1.5")}
            disabled={rotate.isPending}
            onClick={() => {
              if (window.confirm("Make a new invite? Your old QR code and link will stop working.")) {
                rotate.mutate();
              }
            }}
          >
            <RefreshCw size={14} /> New link
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuddiesHome() {
  const profile = useSocialProfile();
  const optedIn = !!profile.data;
  const buddies = useBuddies(optedIn);
  const respond = useBuddyRespond();
  const [tab, setTab] = useState<Tab>("buddies");

  const incomingCount = buddies.data?.incoming.length ?? 0;

  return (
    <div className="space-y-4 lg:space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-[family-name:var(--font-outfit)]">
            Buddies
          </h1>
          {profile.data && (
            <p className="text-text-secondary text-sm mt-0.5">You are @{profile.data.handle}</p>
          )}
        </div>
        {optedIn && (
          <Link href="/chat" className="text-sm font-medium text-primary hover:underline">
            Chats
          </Link>
        )}
      </div>

      {profile.data === undefined ? (
        // Unknown yet: loading, failed, or paused offline with nothing cached.
        profile.fetchStatus === "paused" ? (
          <p className="text-sm text-text-muted">You’re offline. This will load when you reconnect.</p>
        ) : profile.isError ? (
          <p className="text-sm text-text-muted">Couldn’t load your buddies.</p>
        ) : (
          <div className="bg-surface rounded-2xl border border-border h-40 animate-pulse" />
        )
      ) : !profile.data ? (
        <HandleSetup />
      ) : (
        <>
          <div role="tablist" className="flex gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
            {(
              [
                ["buddies", "Buddies"],
                ["requests", incomingCount ? `Requests (${incomingCount})` : "Requests"],
                ["add", "Add"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === id ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "add" ? (
            <AddTab inviteCode={profile.data.inviteCode} />
          ) : !buddies.data ? (
            buddies.isError ? (
              <p className="text-sm text-text-muted">Couldn’t load your buddies.</p>
            ) : buddies.fetchStatus === "paused" ? (
              <p className="text-sm text-text-muted">You’re offline. This will load when you reconnect.</p>
            ) : (
              <div className="bg-surface rounded-2xl border border-border h-48 animate-pulse" />
            )
          ) : tab === "buddies" ? (
            buddies.data.buddies.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-border p-8 text-center space-y-3">
                <p className="text-sm text-text-secondary">No buddies yet.</p>
                <button type="button" onClick={() => setTab("add")} className={btn.primary}>
                  Add your first buddy
                </button>
              </div>
            ) : (
              <div className="bg-surface rounded-2xl border border-border divide-y divide-border">
                {buddies.data.buddies.map((b) => (
                  <PersonRow key={b.userId} user={b}>
                    <MessageButton userId={b.userId} />
                  </PersonRow>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Asked you
                </h2>
                {buddies.data.incoming.length === 0 ? (
                  <p className="text-sm text-text-muted">No requests right now.</p>
                ) : (
                  <div className="bg-surface rounded-2xl border border-border divide-y divide-border">
                    {buddies.data.incoming.map((b) => (
                      <PersonRow key={b.userId} user={b}>
                        <button
                          type="button"
                          className={btn.primary}
                          disabled={respond.isPending}
                          onClick={() => respond.mutate({ userId: b.userId, action: "accept" })}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className={btn.ghost}
                          disabled={respond.isPending}
                          onClick={() => respond.mutate({ userId: b.userId, action: "decline" })}
                        >
                          Decline
                        </button>
                      </PersonRow>
                    ))}
                  </div>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  You asked
                </h2>
                {buddies.data.outgoing.length === 0 ? (
                  <p className="text-sm text-text-muted">No pending requests.</p>
                ) : (
                  <div className="bg-surface rounded-2xl border border-border divide-y divide-border">
                    {buddies.data.outgoing.map((b) => (
                      <PersonRow key={b.userId} user={b}>
                        <button
                          type="button"
                          className={btn.ghost}
                          disabled={respond.isPending}
                          onClick={() => respond.mutate({ userId: b.userId, action: "cancel" })}
                        >
                          Cancel
                        </button>
                      </PersonRow>
                    ))}
                  </div>
                )}
              </section>
              {respond.error && <p className="text-xs text-danger">{respond.error.message}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
