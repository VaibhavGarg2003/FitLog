/**
 * Sentry Client Config — Browser-Side Error Tracking
 * ═══════════════════════════════════════════════════
 *
 * WHAT SENTRY DOES IN THE BROWSER:
 * ────────────────────────────────
 * - Catches unhandled JavaScript errors (TypeError, ReferenceError)
 * - Catches unhandled Promise rejections (API call fails silently)
 * - Records session replays (video of what the user did before crash)
 * - Tracks performance (how long pages take to load)
 *
 * All this data is sent to Sentry's servers asynchronously
 * (fire-and-forget) — the user never notices.
 *
 * WHY DO WE NEED BOTH CLIENT AND SERVER CONFIGS?
 * ───────────────────────────────────────────────
 * Browser errors and server errors are different:
 * - Browser: "Cannot read property 'calories' of undefined"
 * - Server: "Database connection timeout", "LLM API 429"
 * They need separate Sentry configurations.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // DSN = Data Source Name. Tells the SDK where to send events.
  // If empty/undefined, Sentry does nothing (safe for development).

  tracesSampleRate: 0.1,
  // tracesSampleRate: 0.1 = send 10% of transactions for performance
  // monitoring. 100% would be expensive and noisy. 10% is enough
  // to spot slow pages.

  replaysSessionSampleRate: 0.05,
  // Record 5% of all sessions as replays (video-like reconstruction).
  // Helps debug "it doesn't work" reports.

  replaysOnErrorSampleRate: 1.0,
  // Record 100% of sessions that have an ERROR. If something crashes,
  // we always want to see what the user did leading up to it.

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default (privacy).
      // We can unmask specific elements if needed.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Don't send errors in development
  enabled: process.env.NODE_ENV === "production",
});
