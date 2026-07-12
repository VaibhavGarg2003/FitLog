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

  // ── Security Headers ──────────────────────────────────
  // Applied to every response. Each one closes a specific attack class:
  //
  //   X-Frame-Options: DENY        → clickjacking (nobody may <iframe> us;
  //                                  an attacker overlaying invisible buttons
  //                                  on a framed FitLog can't exist)
  //   X-Content-Type-Options       → MIME sniffing (browser must trust our
  //                                  Content-Type, not guess "this .txt
  //                                  looks like JavaScript, let me run it")
  //   Referrer-Policy              → don't leak full URLs (which may contain
  //                                  ?redirect= or slugs) to external sites
  //   Permissions-Policy           → we never use camera/mic/geolocation;
  //                                  saying so blocks any injected script
  //                                  from asking for them
  //
  // Deliberately NOT set: Content-Security-Policy. A strict CSP needs
  // per-request nonces for Next.js inline scripts (middleware work); a lax
  // one is security theater. Revisit as its own task, not a header drop.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
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
