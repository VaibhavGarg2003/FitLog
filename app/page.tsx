/**
 * Landing Page (Server Component — SSR)
 * ═════════════════════════════════════
 *
 * WHY SSR FOR THE LANDING PAGE?
 * ─────────────────────────────
 * The landing page is the first thing Google's crawler sees.
 * SSR (Server-Side Rendering) means the HTML is fully built
 * on the server before being sent to the browser. Google can
 * index the content immediately. Client-rendered pages (CSR)
 * send empty HTML + JavaScript — Google sometimes struggles
 * to index those.
 *
 * This page does NOT have "use client" → it's a Server Component.
 * No React hooks, no browser APIs. Pure HTML output.
 */
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { APP_NAME } from "@/lib/utils/constants";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Dumbbell className="text-primary" size={28} />
          <span className="text-xl font-bold font-[family-name:var(--font-outfit)]">
            {APP_NAME}
          </span>
        </div>
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
      </header>

      {/* ── Hero Section ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-primary-muted text-primary text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Built for Indian gym-goers
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-outfit)] leading-tight mb-4">
          Track workouts.{" "}
          <span className="text-primary">Log nutrition.</span>
          <br />
          See real progress.
        </h1>

        <p className="text-text-secondary text-lg max-w-md mb-8">
          {APP_NAME} understands Indian food, household units, and how you
          actually work out. No more guessing calories.
        </p>

        <Link
          href="/signup"
          className="px-8 py-3 bg-primary text-background rounded-lg hover:bg-primary-hover transition-colors font-semibold text-lg shadow-lg"
        >
          Get started — it&apos;s free
        </Link>
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-6 text-text-muted text-sm border-t border-border">
        © {new Date().getFullYear()} {APP_NAME}. Track honestly. Train smart.
      </footer>
    </div>
  );
}
