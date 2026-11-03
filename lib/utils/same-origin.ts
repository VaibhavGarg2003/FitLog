/**
 * Same-origin guard for cookie-authenticated mutations
 * ═════════════════════════════════════════════════════
 *
 * Session cookies are SameSite=Lax, which already stops most cross-site
 * POSTs. The buddy/chat routes add a second, explicit check (defence in
 * depth): a browser always labels a request with Fetch Metadata —
 * `Sec-Fetch-Site` — and only "same-origin" (our own pages) or "none" (the
 * user typed/bookmarked it) is acceptable for a state-changing call. Older
 * browsers without Fetch Metadata send `Origin` on POST/PUT/PATCH/DELETE;
 * it must match our own origin.
 *
 * Requests carrying neither header are not from a browser page (curl,
 * server-to-server) and can't ride a victim's cookies, so they pass — the
 * session cookie still decides who they are.
 */

export function isCrossSiteRequest(headers: Headers, requestUrl: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) {
    return site !== "same-origin" && site !== "none";
  }

  const origin = headers.get("origin");
  if (origin !== null) {
    try {
      return origin !== new URL(requestUrl).origin;
    } catch {
      return true;
    }
  }

  return false;
}
