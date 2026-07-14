/**
 * Authenticated App Layout
 * ════════════════════════
 *
 * Wraps all pages that need: auth + bottom nav + profile guard.
 * Route group (app) → URL has no "/app/" prefix.
 *
 * PROFILE GUARD:
 * ──────────────
 * Checks is_onboarded = true before rendering any page.
 * Non-onboarded users are redirected to /onboarding.
 *
 * NOTE: /onboarding lives at app/onboarding (outside this group)
 * so it never triggers this layout — no infinite loop possible.
 *
 * WHY isUserOnboarded() AND NOT getProfileByUserId()?
 * ────────────────────────────────────────────────────
 * A profile row can exist with is_onboarded = false (partial write / crash).
 * is_onboarded = true is the correct signal that setup is complete.
 *
 * WHY HERE AND NOT IN proxy.ts?
 * ─────────────────────────────
 * proxy.ts = Edge Runtime = no Prisma. This layout = Server Component = DB ok.
 */
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/supabase/server";
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { TopNav } from "@/components/shared/top-nav";
import { BottomNav } from "@/components/shared/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Local JWT verification (no network round-trip). The proxy already
  // validated auth first; this is the belt-and-suspenders check.
  const userId = await getAuthUserId();
  if (!userId) {
    redirect("/login");
  }

  // Redirect to onboarding if setup is not complete
  const onboarded = await isUserOnboarded(userId);
  if (!onboarded) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop nav + mobile logo/home bar (responsive; see top-nav.tsx) */}
      <TopNav />
      {/* Wider canvas on desktop; bottom padding only needed below lg where
          the fixed BottomNav sits. */}
      <main className="px-4 pt-4 pb-24 lg:pb-8 max-w-lg lg:max-w-5xl mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

