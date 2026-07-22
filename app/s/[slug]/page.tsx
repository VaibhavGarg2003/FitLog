/**
 * Public Share Page — /s/[slug]
 * ═══════════════════════════════
 *
 * The friend's view: no login required. Server-rendered (not client) for
 * two reasons:
 *   1. Open Graph tags → a rich preview card in WhatsApp, which IS the
 *      distribution channel in the Indian market (doc 06). The preview is
 *      the growth feature, not polish.
 *   2. The snapshot is fetched server-to-server from Django (no CORS, no
 *      token, and the public endpoint needs neither).
 *
 * States: valid plan · expired/revoked (410) · not found (404). The
 * failure states are still a landing page that markets FitLog — a dead
 * link should never be a dead end.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { djangoPublicFetch } from "@/lib/services/django.service";
import { getAuthUserId } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/utils/constants";
import { CopyPlanButton } from "./copy-button";

interface SharedExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  targetSets: number;
}

interface SharePayload {
  templateName?: string;
  splitType?: string | null;
  exercises?: SharedExercise[];
}

interface ShareData {
  kind: string;
  title: string;
  ownerFirstName: string;
  payload: SharePayload;
  createdAt: string;
}

async function fetchShare(
  slug: string
): Promise<{ status: number; data: ShareData | { error?: string } }> {
  const res = await djangoPublicFetch<ShareData | { error?: string }>(
    `/api/share-links/${encodeURIComponent(slug)}`
  );
  return { status: res.status, data: res.data };
}

// ── Open Graph metadata (the WhatsApp preview) ───────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let share: ShareData | null = null;
  try {
    const { status, data } = await fetchShare(slug);
    if (status === 200) share = data as ShareData;
  } catch {
    // fall through to generic metadata
  }

  if (!share) {
    return {
      title: `Shared plan — ${APP_NAME}`,
      description: `A workout plan shared via ${APP_NAME}.`,
    };
  }

  const count = share.payload.exercises?.length ?? 0;
  const title = `${share.title} — a workout plan by ${share.ownerFirstName || "a FitLog user"}`;
  const description = `${count} exercise${count === 1 ? "" : "s"}. Open in ${APP_NAME} to try this routine and track your own.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: APP_NAME,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ status, data }, viewerId] = await Promise.all([
    fetchShare(slug),
    getAuthUserId(),
  ]);

  // ── Expired / revoked / not found → friendly landing page ──
  if (status !== 200) {
    const gone = status === 410;
    return (
      <Shell>
        <div className="text-center space-y-4">
          <Dumbbell className="mx-auto text-primary" size={44} />
          <h1 className="text-xl font-bold text-text-primary">
            {gone ? "This link has expired" : "Plan not found"}
          </h1>
          <p className="text-text-secondary text-sm">
            {gone
              ? "The person who shared this plan has since removed it or it expired."
              : "This share link doesn't exist."}
          </p>
          <MarketingCTA />
        </div>
      </Shell>
    );
  }

  const share = data as ShareData;
  const exercises = share.payload.exercises ?? [];

  return (
    <Shell>
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <Dumbbell className="mx-auto text-primary" size={40} />
          <h1 className="text-2xl font-bold text-text-primary font-[family-name:var(--font-outfit)]">
            {share.title}
          </h1>
          <p className="text-text-secondary text-sm">
            A workout plan shared by{" "}
            <span className="text-text-primary font-medium">
              {share.ownerFirstName || "a FitLog user"}
            </span>
          </p>
        </div>

        {/* Exercises */}
        <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {exercises.length === 0 ? (
            <p className="p-4 text-sm text-text-muted text-center">
              This plan has no exercises.
            </p>
          ) : (
            exercises.map((ex, i) => (
              <div key={ex.exerciseId || i} className="p-3 px-4 flex items-center gap-3">
                <span className="text-text-muted text-sm w-5 tabular-nums">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary text-sm truncate">
                    {ex.name}
                  </p>
                  <p className="text-xs text-text-muted">{ex.muscleGroup}</p>
                </div>
                <span className="text-xs text-text-secondary shrink-0">
                  {ex.targetSets} set{ex.targetSets === 1 ? "" : "s"}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Copy CTA — the growth moment */}
        <CopyPlanButton slug={slug} isLoggedIn={viewerId !== null} />

        <p className="text-center text-xs text-text-muted">
          Made with{" "}
          <Link href="/" className="text-primary hover:underline">
            {APP_NAME}
          </Link>{" "}
          — the Indian-first fitness tracker.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function MarketingCTA() {
  return (
    <Link
      href="/signup"
      className="inline-block mt-2 py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
    >
      Try {APP_NAME} free
    </Link>
  );
}
