/**
 * Next.js Proxy — Auth Guard + Session Refresh
 * ═════════════════════════════════════════════
 *
 * NEXT.JS 16 CHANGE: "middleware" was renamed to "proxy"
 * ─────────────────────────────────────────────────────
 * In Next.js 16, the `middleware.ts` file convention was renamed
 * to `proxy.ts` and the exported function is now `proxy()`.
 *
 * Why? The term "middleware" was confused with Express.js middleware.
 * "Proxy" better describes what it does: it sits BETWEEN the user
 * and your app, intercepting requests before pages render.
 *
 * THIS FILE MUST BE AT THE PROJECT ROOT (next to package.json).
 *
 * WHAT HAPPENS ON EVERY REQUEST:
 * ──────────────────────────────
 * 1. User visits any URL (e.g., /dashboard)
 * 2. This proxy runs BEFORE the page renders
 * 3. It checks: is the user logged in?
 * 4. Decision:
 *    - Not logged in + visiting /dashboard? → Redirect to /login
 *    - Logged in + visiting /login? → Redirect to /onboarding
 *      (onboarding page sends already-complete users to /dashboard)
 *    - Otherwise → Let the request through
 *
 * Onboarding completeness (is_onboarded) cannot be checked here — Edge has
 * no Prisma. App routes under (app)/layout redirect incomplete users to
 * /onboarding; the landing page also hides app nav for those users.
 */
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/dashboard",
  "/workout",
  "/nutrition",
  "/progress",
  "/settings",
  "/onboarding",
];

// Routes that logged-in users should NOT see.
// Send them to /onboarding (not /dashboard): incomplete users land on the
// wizard; already-onboarded users are bounced to /dashboard by onboarding/page.
// Edge proxy cannot query Prisma for is_onboarded, so this path is safe for both.
const AUTH_ROUTES = ["/login", "/signup", "/confirmed"];

export async function proxy(request: NextRequest) {
  // Step 1: Refresh session tokens (prevents silent logout)
  const { user, supabaseResponse } = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Step 2: Check if this is a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  const isAuthRoute = AUTH_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Step 3: Enforce auth rules
  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // Step 4: Let the request through with refreshed cookies
  return supabaseResponse;
}

// WHICH ROUTES TRIGGER THIS PROXY:
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
