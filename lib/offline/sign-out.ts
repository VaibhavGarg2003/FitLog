/**
 * Client-side sign-out that respects unsynced sets
 * ════════════════════════════════════════════════
 *
 * Used by every sign-out button (user menu, Settings). Queued sets live only on
 * this phone, so signing out must:
 *   1. warn if this user has sets that never reached the server — and if the
 *      queue can't even be read, say so rather than pretend there are none
 *   2. delete them ONLY if the user agreed AND the server really signed them
 *      out — if the logout request failed, the session may still be valid and
 *      the sets can still sync, so throwing them away would lose real data.
 *
 * Callers must pass the AUTHORITATIVE user id (the server layout's, via the
 * outbox provider or a server page prop) — not a profile query that may not
 * have loaded yet.
 *
 * The in-memory query cache is cleared either way (existing behaviour: the
 * next person on this device gets a clean slate).
 */

import type { QueryClient } from "@tanstack/react-query";
import { getOutboxStore } from "./outbox-store";

/** Number of this user's queued sets, or null if it couldn't be determined. */
export async function unsyncedSetCount(userId: string | null | undefined): Promise<number | null> {
  if (!userId) return null;
  try {
    return await getOutboxStore().countByUser(userId);
  } catch {
    return null;
  }
}

export function unsyncedWarning(count: number | null): string {
  if (count === null) {
    return "Couldn't check whether sets you logged are still waiting to sync on this phone. " +
      "Signing out may delete them. Sign out anyway?";
  }
  return count === 1
    ? "1 set you logged hasn't reached the server yet. Signing out deletes it from this phone. Sign out anyway?"
    : `${count} sets you logged haven't reached the server yet. Signing out deletes them from this phone. Sign out anyway?`;
}

/**
 * Returns false if the user cancelled. Otherwise signs out and clears client
 * data; the caller navigates to /login.
 */
export async function signOutClient(
  userId: string | null | undefined,
  queryClient: QueryClient
): Promise<boolean> {
  const unsynced = await unsyncedSetCount(userId);
  if (unsynced !== 0 && !window.confirm(unsyncedWarning(unsynced))) {
    return false;
  }

  let loggedOut = false;
  try {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    loggedOut = res.ok;
  } catch {
    // Still leave the app even if the request fails (existing behaviour).
  }

  if (loggedOut && unsynced !== 0 && userId) {
    try {
      await getOutboxStore().clearUser(userId);
    } catch {
      // Not a leak: records are keyed by user and only ever shown to or sent
      // for that user. But the user asked for them gone, so be honest.
      window.alert(
        "You're signed out, but this phone couldn't remove the unsynced sets. " +
          "They stay hidden and will sync if you sign in again."
      );
    }
  }
  queryClient.clear();
  return true;
}
