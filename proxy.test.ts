/**
 * proxy.ts matcher — which requests run the auth/session proxy
 *
 * PWA files must bypass it: the service worker script is re-fetched on every
 * update check, and the manifest, icons and offline page are public. Pages and
 * API routes must still go through it (session refresh + auth redirects).
 */

import { describe, it, expect } from "vitest";
// Docs for Next 16.2.10 call this unstable_doesProxyMatch; the installed
// package still exports the pre-rename name.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "./proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each([
    "/sw.js",
    "/offline.html",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/maskable-512.png",
    "/_next/static/chunks/app.js",
  ])("skips static/PWA file %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  it.each([
    "/",
    "/dashboard",
    "/workout",
    "/login",
    "/api/workout",
    "/api/workout/abc/sets",
  ])("still runs for %s", (url) => {
    expect(matches(url)).toBe(true);
  });
});
