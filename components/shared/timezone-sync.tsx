/**
 * Timezone Sync — fills in profiles.timezone for accounts that have none
 * ═════════════════════════════════════════════════════════════════════
 *
 * Renders nothing. Mounted once in the authenticated app layout, which reads
 * the stored zone server-side and passes it in — so an account that already
 * has a zone costs zero network requests.
 *
 * FILL, NEVER FOLLOW:
 * ───────────────────
 * It writes ONLY when no zone is stored (accounts created before the column
 * shipped, or whose onboarding browser could not report one). It does NOT
 * overwrite a stored zone when the device reports a different one, because
 * the account zone is the calendar the user's history is dated in:
 *   - A laptop set to UTC and a phone set to IST would otherwise flip the
 *     stored zone on every app open, moving "today" back and forth.
 *   - Flying west can make "today" fall BEFORE the latest target-history row;
 *     a stable zone keeps day boundaries consistent.
 * Changing the zone later is a deliberate act (PATCH /api/profile/preferences
 * from a future Settings control), not a side effect of where a device is.
 *
 * It goes through PATCH /api/profile/preferences, never PUT /api/profile,
 * because PUT recalculates nutrition targets.
 *
 * FAILURE IS SILENT ON PURPOSE: a failed sync changes nothing the user can
 * see today (server code falls back to the client date / server date), and it
 * simply retries on the next full page load.
 */

"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deviceTimeZone } from "@/lib/utils/local-date";

export function TimezoneSync({
  savedTimeZone,
}: {
  savedTimeZone: string | null;
}) {
  const queryClient = useQueryClient();
  // The layout's prop is not refreshed after a successful write (layouts do
  // not re-render on client navigation), so remember that this mount already
  // sent — otherwise every re-run of the effect would PATCH again.
  const sent = useRef(false);

  useEffect(() => {
    if (savedTimeZone !== null || sent.current) return;
    const device = deviceTimeZone();
    if (!device) return;
    sent.current = true;

    fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // onlyIfUnset: the server re-checks atomically, so a second device or a
      // Settings save that filled the zone first is never overwritten.
      body: JSON.stringify({ timezone: device, onlyIfUnset: true }),
    })
      .then((res) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["profile"] });
        }
      })
      .catch(() => {
        // Offline or server down — try again on the next page load.
      });
  }, [savedTimeZone, queryClient]);

  return null;
}
