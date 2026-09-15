/**
 * FitLog Service Worker — offline fallback ONLY
 * ═════════════════════════════════════════════
 *
 * WHAT IT DOES:
 * ─────────────
 * Page navigations try the network. If the network throws (no signal), the
 * user gets /offline.html instead of Chrome's "No internet" dinosaur.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 * ────────────────────────────────
 * - It never caches API responses. They are one user's private data behind
 *   httpOnly cookies; a cached /api/nutrition/daily could be shown to a
 *   different account on a shared phone, or after logout.
 * - It never caches pages, JS, CSS or RSC payloads. A cached HTML shell
 *   points at hashed /_next/static chunks that a later deploy deletes, which
 *   breaks the app in ways no user can fix. Only offline.html is cached.
 * - It does not handle any request except top-level navigations, so every
 *   fetch() the app makes goes straight to the network as if it weren't here.
 *
 * WHY skipWaiting() IS SAFE HERE:
 * ───────────────────────────────
 * The classic reason to wait before activating a new worker is that an open
 * page is running OLD app code served from the old worker's cache. This worker
 * serves no app code, so a new version activating immediately cannot mix old
 * and new files. Revisit this if the worker ever starts caching the app.
 *
 * Bump CACHE_VERSION whenever offline.html changes, so installs refetch it.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `fitlog-offline-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: "reload" bypasses the HTTP cache so a new version is fetched fresh.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith("fitlog-offline-") && name !== CACHE_NAME
          )
          .map((name) => caches.delete(name))
      );
      // Navigation preload lets the browser start the page request while the
      // worker boots, so having a worker costs no extra navigation latency.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        // Only a thrown fetch lands here — a genuine network failure. HTTP
        // errors (404, 500) are real responses and are passed through above.
        const cache = await caches.open(CACHE_NAME);
        const offline = await cache.match(OFFLINE_URL);
        return offline ?? Response.error();
      }
    })()
  );
});
