/**
 * TanStack Query Provider
 * ═══════════════════════
 *
 * WHAT IS A "PROVIDER" IN REACT?
 * ──────────────────────────────
 * A Provider is a React component that wraps your app and makes
 * something available to ALL child components, without passing
 * it through props at every level. This is called "Context."
 *
 * Without a Provider, every component that needs data fetching
 * would have to set up TanStack Query individually. With the
 * Provider, they all share ONE QueryClient instance.
 *
 * WHY "use client"?
 * ─────────────────
 * In Next.js App Router, components are Server Components by default
 * (they run on the server, not in the browser). Server Components
 * can't use React hooks (useState, useEffect, etc.) because hooks
 * need browser APIs.
 *
 * "use client" tells Next.js: "This component runs in the browser."
 * Providers MUST be client components because they use React Context
 * (which is a browser-side feature).
 *
 * WHY useState FOR QueryClient?
 * ─────────────────────────────
 * We create QueryClient inside useState() so it's created ONCE
 * and reused across re-renders. If we created it outside useState,
 * a new client would be created on every render, losing all cache.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState with an initializer function (the () => new QueryClient())
  // ensures the QueryClient is created ONCE, not on every render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime: how long cached data is considered "fresh."
            // During this window, TanStack Query serves cached data
            // WITHOUT making a network request. After 5 min, it refetches.
            staleTime: 5 * 60 * 1000, // 5 minutes

            // retry: how many times to retry a failed request.
            // Network glitches happen. 1 retry is usually enough.
            retry: 1,

            // refetchOnWindowFocus: refetch every active query whenever the
            // tab regains focus. This SOUNDS helpful, but in practice it
            // caused a refetch storm — clicking into DevTools and back, or
            // alt-tabbing, refired `profile` + `daily` + every other query,
            // producing the duplicate 5-6s requests seen in the network tab.
            //
            // We turn it OFF and rely on explicit invalidation instead: the
            // log/delete/finish mutations already invalidate the exact caches
            // they change (see lib/hooks/use-nutrition.ts etc.), so the UI
            // stays fresh after writes without polling on every focus event.
            // Trade-off: data changed on ANOTHER device won't auto-refresh
            // when you refocus this tab — acceptable for a single-user app.
            refetchOnWindowFocus: false,
          },
          mutations: {
            // retry: 0 for mutations (writes).
            // If "log workout" fails, we DON'T silently retry —
            // that could create duplicate entries. Show an error instead.
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
