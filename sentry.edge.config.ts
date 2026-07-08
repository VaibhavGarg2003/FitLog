/**
 * Sentry Edge Config — Edge Runtime Error Tracking
 * ═════════════════════════════════════════════════
 *
 * Edge runtime is used by Next.js middleware.
 * It's a lighter runtime (not full Node.js) that runs at CDN edge nodes.
 * Our auth middleware runs here.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
