/**
 * Django Service Client — server-side calls to the fitlog-django service
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE: the browser NEVER calls Django directly. It calls our
 * same-origin Next.js API routes, which use these helpers to proxy to
 * Django with the user's Supabase JWT. Benefits:
 *   - no CORS (browser only ever talks to its own origin)
 *   - the JWT stays server-side (never handed to client JS for a
 *     cross-origin call)
 *   - the public share page is server-rendered here anyway (for Open Graph
 *     tags — the WhatsApp preview IS the growth feature), so this hop
 *     already exists for the public path.
 *
 * DJANGO_URL is server-only (not NEXT_PUBLIC) — set it in .env.local and in
 * Vercel's env vars for production.
 */

import { getAccessToken } from "@/lib/supabase/server";
import { UpstreamError } from "@/lib/utils/errors";

function djangoBaseUrl(): string {
  const url = process.env.DJANGO_URL;
  if (!url) throw new UpstreamError("Sharing service is not configured.");
  return url.replace(/\/$/, "");
}

export interface DjangoResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Call Django as the CURRENT user (forwards their JWT). Returns the parsed
 * body plus status so the route can mirror Django's status codes (404/410/
 * 429/…) back to the client.
 */
export async function djangoAuthedFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<DjangoResponse<T>> {
  const token = await getAccessToken();
  if (!token) {
    // Caller should have checked auth already; treat as unauthenticated.
    return { ok: false, status: 401, data: { error: "Unauthorized" } as T };
  }
  return rawFetch<T>(path, { ...init, token });
}

/**
 * Call a PUBLIC Django endpoint (no auth) — used by the server-rendered
 * /s/[slug] share page.
 */
export async function djangoPublicFetch<T = unknown>(
  path: string
): Promise<DjangoResponse<T>> {
  return rawFetch<T>(path, {});
}

async function rawFetch<T>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: unknown; token?: string }
): Promise<DjangoResponse<T>> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Resolve the base URL OUTSIDE the try: a missing DJANGO_URL is a config
  // error, not a network failure, and must surface as its own message rather
  // than being masked by the generic "unavailable" catch below.
  const base = djangoBaseUrl();

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Render free tier can cold-start (~30-60s); give it room but cap it.
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (err) {
    // Distinguish a cold-start timeout from a genuine connectivity failure so
    // the message tells the user what to actually do.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new UpstreamError(
      timedOut
        ? "The sharing service is waking up (free-tier cold start). Please try again in a moment."
        : "The sharing service is unavailable. Please try again in a moment."
    );
  }

  // Django returns JSON for every route we call; tolerate an empty body.
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = {} as T;
  }

  return { ok: res.ok, status: res.status, data };
}
