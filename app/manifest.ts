/**
 * Web App Manifest — what makes FitLog installable
 * ═════════════════════════════════════════════════
 *
 * Next.js serves this at /manifest.webmanifest and adds the <link> to every
 * page. Chrome on Android reads it to offer "Install app" and to build the
 * home-screen app (a WebAPK): its name, icon, colours and launch page.
 *
 * start_url is /dashboard, not /: an installed app should open into the app.
 * Logged-out users are sent to /login?redirect=/dashboard by proxy.ts, and
 * users who haven't finished onboarding by (app)/layout.tsx — so it is safe
 * even when installed from the landing page.
 *
 * Icons: "any" icons are shown as-is; the "maskable" icon has a full-bleed
 * background with the dumbbell inside the central safe zone, so Android can
 * crop it to a circle or squircle without cutting the logo.
 */
import type { MetadataRoute } from "next";
import {
  APP_DESCRIPTION,
  PWA_NAME,
  PWA_SHORT_NAME,
  THEME_COLOR,
} from "@/lib/utils/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PWA_NAME,
    short_name: PWA_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon. Both are high-frequency actions.
    shortcuts: [
      {
        name: "Log workout",
        url: "/workout",
        icons: [{ src: "/icons/shortcut-workout-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Log meal",
        url: "/nutrition",
        icons: [{ src: "/icons/shortcut-meal-96.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
