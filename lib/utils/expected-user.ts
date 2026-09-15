/**
 * Expected-user guard for requests replayed from the offline outbox
 * ═════════════════════════════════════════════════════════════════
 *
 * Queued sets are tagged with the user who logged them, but requests are
 * authenticated by the browser's cookies — which every tab shares. If someone
 * signs out and signs in as a different person in another tab, an older tab
 * can still be sending the first person's queue, now under the second
 * person's cookies.
 *
 * So the outbox sends the id it expects in this header, and routes that accept
 * outbox traffic answer 401 when it doesn't match the session. The client
 * treats that exactly like being logged out: park the set and ask to sign in.
 *
 * NOT an authorization mechanism — the cookie session still decides what a
 * request may do. This only stops data from being written to the wrong account
 * by the app itself. Requests without the header are unaffected.
 */

export const EXPECTED_USER_HEADER = "x-fitlog-expected-user";

/** True when the request names an expected user that isn't the signed-in one. */
export function isExpectedUserMismatch(
  headers: Headers,
  authenticatedUserId: string
): boolean {
  const expected = headers.get(EXPECTED_USER_HEADER);
  return expected !== null && expected !== authenticatedUserId;
}
