/**
 * Login Page
 * ══════════
 *
 * SUSPENSE BOUNDARY:
 * ──────────────────
 * In Next.js 15+, `useSearchParams()` requires a Suspense boundary.
 * Why? Because search params (?redirect=/dashboard) are only available
 * in the browser, not during server-side static generation. Without
 * Suspense, Next.js can't pre-render this page at build time.
 *
 * Solution: We split the page into:
 * 1. LoginPage (server component wrapper with Suspense)
 * 2. LoginForm (client component with the actual form + useSearchParams)
 *
 * The Suspense fallback shows a loading skeleton while the browser
 * figures out the search params.
 */
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-pulse">
          <div className="h-10 w-10 bg-surface rounded-full mx-auto" />
          <div className="h-6 w-40 bg-surface rounded mx-auto" />
          <div className="h-12 w-full bg-surface rounded-lg" />
          <div className="h-12 w-full bg-surface rounded-lg" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
