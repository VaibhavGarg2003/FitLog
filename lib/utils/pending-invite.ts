/**
 * Pending buddy invite — survives signup, OAuth and onboarding
 * ═════════════════════════════════════════════════════════════
 *
 * A new person scans a friend's QR code (/buddies/invite/<code>), has no
 * account, and goes through signup → (email confirm / Google) → onboarding.
 * Each hop used to drop the destination, so they landed on /dashboard and the
 * invite was lost (Codex review, 2026-10-09).
 *
 * The proxy remembers the invite path in a short-lived httpOnly cookie
 * whenever one is visited; onboarding completion returns it as `next` and
 * clears it. Only an exact /buddies/invite/<22-char code> path is ever
 * accepted, so the cookie can't become an open redirect.
 */

export const PENDING_INVITE_COOKIE = "fitlog_pending_invite";
export const PENDING_INVITE_MAX_AGE = 60 * 60; // 1 hour

const INVITE_PATH = /^\/buddies\/invite\/[A-Za-z0-9_-]{22}$/;

export function isInvitePath(path: string): boolean {
  return INVITE_PATH.test(path);
}

/** The stored path if it is a valid invite path, otherwise null. */
export function pendingInvitePath(cookieValue: string | undefined): string | null {
  return cookieValue && isInvitePath(cookieValue) ? cookieValue : null;
}
