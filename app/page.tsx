/**
 * Landing Page (Server Component — SSR)
 * ═════════════════════════════════════
 *
 * WHY SSR FOR THE LANDING PAGE?
 * ─────────────────────────────
 * The landing page is the first thing Google's crawler sees.
 * SSR (Server-Side Rendering) means the HTML is fully built
 * on the server before being sent to the browser. Google can
 * index the content immediately.
 *
 * AUTH-AWARE (three variants):
 * ───────────────────────────
 *   logged OUT           → marketing: Log in / Sign up / "Get started"
 *   logged IN + onboarded → app navbar + "Go to Dashboard"
 *   logged IN + incomplete onboarding → logo + name only (no Dashboard /
 *                           Settings / app links). Clear CTA to finish setup.
 *                           App routes already hard-redirect via (app)/layout.
 *
 * Trade-off: reading cookies (+ onboarded check) makes this route dynamic.
 * Verification is local JWT + one lightweight profile flag — worth it so
 * mid-onboarding users never see "Go to Dashboard" after a browser restart.
 */
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { APP_NAME } from "@/lib/utils/constants";
import { getAuthUserId } from "@/lib/supabase/server";
import { isUserOnboarded } from "@/lib/repositories/profile.repository";
import { UserMenu } from "@/components/shared/user-menu";

const APP_NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/workout", label: "Workout" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

export default async function LandingPage() {
  const userId = await getAuthUserId();
  const isLoggedIn = userId !== null;
  // Incomplete = has a session but never finished the wizard (no is_onboarded).
  const isOnboarded = userId ? await isUserOnboarded(userId) : false;
  const needsOnboarding = isLoggedIn && !isOnboarded;

  return (
    <div className="w-full min-h-dvh bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Dumbbell className="text-primary" size={28} />
          <span className="text-xl font-bold font-[family-name:var(--font-outfit)]">
            {APP_NAME}
          </span>
        </div>

        {needsOnboarding ? (
          /* Mid-onboarding: brand only — no Dashboard/Settings/app chrome.
             Sign out is still available so they can switch accounts. */
          <div className="flex items-center gap-3">
            <Link
              href="/onboarding"
              className="px-4 py-2 text-sm bg-primary text-background rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              Complete setup
            </Link>
            <UserMenu />
          </div>
        ) : isLoggedIn ? (
          /* Fully onboarded member navbar */
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="flex items-center gap-1 sm:gap-2">
              {APP_NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hidden sm:block px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm bg-primary text-background rounded-lg hover:bg-primary-hover transition-colors font-medium sm:hidden"
              >
                Open app
              </Link>
            </nav>
            <UserMenu />
          </div>
        ) : (
          /* Visitor navbar */
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm bg-primary text-background rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              Sign up
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero Section ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-primary-muted text-primary text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          {needsOnboarding
            ? "Setup incomplete"
            : "Built for Indian gym-goers"}
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-outfit)] leading-tight mb-4">
          {needsOnboarding ? (
            <>
              Finish setting up
              <br />
              <span className="text-primary">your profile</span>
            </>
          ) : isLoggedIn ? (
            <>
              Welcome back.
              <br />
              <span className="text-primary">Ready to train?</span>
            </>
          ) : (
            <>
              Track workouts.{" "}
              <span className="text-primary">Log nutrition.</span>
              <br />
              See real progress.
            </>
          )}
        </h1>

        <p className="text-text-secondary text-lg max-w-md mb-8">
          {needsOnboarding
            ? "You're signed in, but onboarding isn't finished yet. Complete a few quick steps so we can build your calorie targets — then the dashboard unlocks."
            : isLoggedIn
              ? "Your dashboard has today's calories, macros, and workout — pick up where you left off."
              : `${APP_NAME} understands Indian food, household units, and how you actually work out. No more guessing calories.`}
        </p>

        <Link
          href={
            needsOnboarding
              ? "/onboarding"
              : isLoggedIn
                ? "/dashboard"
                : "/signup"
          }
          className="px-8 py-3 bg-primary text-background rounded-lg hover:bg-primary-hover transition-colors font-semibold text-lg shadow-lg"
        >
          {needsOnboarding
            ? "Complete onboarding →"
            : isLoggedIn
              ? "Go to Dashboard →"
              : "Get started — it's free"}
        </Link>

        {needsOnboarding && (
          <p className="mt-4 text-sm text-text-muted max-w-sm">
            Dashboard, workout, nutrition, and settings stay locked until setup
            is done. Your answers are saved as you go.
          </p>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-6 text-text-muted text-sm border-t border-border">
        © {new Date().getFullYear()} {APP_NAME}. Track honestly. Train smart.
      </footer>
    </div>
  );
}
