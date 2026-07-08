/**
 * Sentry Server Config — Server-Side Error Tracking
 * ══════════════════════════════════════════════════
 *
 * Catches errors in:
 * - API route handlers (/app/api/*)
 * - Server Actions
 * - Server Components during SSR
 *
 * Examples: database timeouts, LLM API failures, Prisma errors.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Note: SENTRY_DSN (no NEXT_PUBLIC_ prefix) — this is server-only.
  // Server env vars are NOT exposed to the browser.

  tracesSampleRate: 0.1,

  // Don't send errors in development
  enabled: process.env.NODE_ENV === "production",
});
