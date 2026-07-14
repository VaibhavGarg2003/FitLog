/**
 * Auth cookie flags for Supabase session storage
 * ═══════════════════════════════════════════════
 *
 * WHY httpOnly?
 * ─────────────
 * Default @supabase/ssr browser cookies use document.cookie (httpOnly: false),
 * so any XSS can read the JWT access/refresh tokens. Our app never needs the
 * browser to call Supabase Auth/DB directly — only our Next.js API routes do,
 * reading cookies on the server. So we set httpOnly: true.
 *
 * Network tab note:
 * Set-Cookie values can still appear in DevTools for the page owner (that is
 * how browsers work). Attackers cannot read httpOnly cookies from JS, and the
 * browser never receives the raw Supabase /auth/v1/token JSON body once login
 * is server-side.
 */

export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  // Secure cookies only over HTTPS (production / Vercel). Local http:// is fine.
  secure: process.env.NODE_ENV === "production",
};
