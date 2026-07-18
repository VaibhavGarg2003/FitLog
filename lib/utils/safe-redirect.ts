/**
 * safeRedirectPath — sanitize a ?redirect= parameter
 * ═══════════════════════════════════════════════════
 *
 * THE ATTACK (open redirect): a phisher sends a victim
 *   https://fitlog.app/login?redirect=//evil.com
 * The victim sees the REAL FitLog login page, logs in… and is then
 * forwarded to evil.com (protocol-relative URLs inherit https://).
 * "You logged in on the real site, then landed on a perfect fake asking
 * you to re-enter your password" — that's the phish.
 *
 * THE RULE: a redirect target must be a same-origin absolute path.
 * Reject anything that could escape the origin:
 *   //evil.com        protocol-relative
 *   /\evil.com        backslash quirk (browsers normalize \ to /)
 *   https://evil.com  absolute URL
 *   javascript:...    scheme smuggling
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  // /onboarding: incomplete users stay in the wizard; already-onboarded users
  // are immediately redirected to /dashboard by app/onboarding/page.tsx.
  // Prefer this over /dashboard so mid-setup users never flash the app shell.
  fallback = "/onboarding"
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback; // must be an absolute path
  if (raw.startsWith("//")) return fallback; // protocol-relative escape
  if (raw.includes("\\")) return fallback; // backslash normalization quirk
  if (raw.includes("://")) return fallback; // embedded scheme
  return raw;
}
