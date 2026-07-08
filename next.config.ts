/**
 * Next.js Configuration
 * ═════════════════════
 *
 * This file configures how Next.js builds and runs.
 *
 * withSentryConfig wraps the standard config and:
 * 1. Uploads source maps to Sentry during `next build`
 *    (so Sentry can show readable stack traces, not minified code)
 * 2. Injects Sentry initialization code into the built app
 */
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Images ────────────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        // Allow images hosted on Supabase Storage.
        // Without this, <Image src="https://xxx.supabase.co/...">
        // would be blocked by Next.js for security.
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        // Google profile avatars (from Google OAuth).
      },
    ],
  },

  // ── Experimental ──────────────────────────────────────
  experimental: {
    // serverActions is enabled by default in Next.js 15+
  },
};

// Wrap with Sentry — only modifies the build process, not runtime
export default withSentryConfig(nextConfig, {
  // Suppress Sentry's noisy webpack logs during build
  silent: true,

  // Organization and project in Sentry dashboard
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps so Sentry shows readable stack traces
  widenClientFileUpload: true,

  // Disable Sentry telemetry (Sentry tracking itself — we don't need this)
  disableLogger: true,
});
