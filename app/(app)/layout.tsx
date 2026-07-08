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
import { createClient } from "@/lib/supabase/server";
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { BottomNav } from "@/components/shared/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders auth check (proxy.ts handles this first)
  if (!user) {
    redirect("/login");
  }

  // Redirect to onboarding if setup is not complete
  const onboarded = await isUserOnboarded(user.id);
  if (!onboarded) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-20 px-4 pt-4 max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

