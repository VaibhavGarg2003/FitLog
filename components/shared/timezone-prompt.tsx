"use client";

/**
 * Timezone Prompt — "You seem to be in Toronto now. Switch?"
 * ═══════════════════════════════════════════════════════════
 *
 * Shown when this device reports a different zone from the one saved on the
 * account. The user decides; nothing switches on its own (see
 * timezone-provider.tsx: the saved zone is the app's calendar).
 *
 * RULES:
 * - Different spellings of one place never prompt (Asia/Calcutta and
 *   Asia/Kolkata — see sameTimeZone). Zones are never compared by UTC offset.
 * - "Keep" is remembered on this browser for 14 days, keyed by account, saved
 *   zone and device zone: another account on the same laptop is still asked,
 *   and a different device zone (a new trip) asks again. After 14 days it asks
 *   once more, in case the "trip" turned into a move.
 * - Checked after mount (never during server render), and again whenever the
 *   app returns to the foreground or comes back online — an installed app can
 *   stay open across a flight.
 * - Only offered while online. "Use …" is a compare-and-set: if another device
 *   changed the zone in the meantime the server refuses (409) and the page
 *   reloads to show the current state, instead of overwriting it.
 * - Past data is never moved. Only dates decided from now on follow the zone.
 */

import { useState, useSyncExternalStore } from "react";
import {
  useDeviceTimeZone,
  useIsClient,
  useMinuteClock,
  useUserTimeZone,
} from "@/components/shared/timezone-provider";
import { timeZoneLabel } from "@/lib/utils/local-date";
import { keepKey, shouldPromptTimezone } from "@/lib/utils/timezone-prompt-rules";

/** When "Keep" was answered for `key` on this browser, if storage allows. */
function storedKeepAt(key: string): number | null {
  try {
    const at = Number(localStorage.getItem(key));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null; // storage blocked → only this page's in-memory answer counts
  }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function TimezonePrompt({ userId }: { userId: string }) {
  const { savedTimeZone } = useUserTimeZone();
  // Both re-read when the app returns to the foreground / connectivity changes.
  const deviceZone = useDeviceTimeZone();
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const isClient = useIsClient();
  const now = useMinuteClock();
  // "Keep" answers given in this page's lifetime, with WHEN — they expire
  // after 14 days like the stored ones, so a tab or installed app left open
  // for weeks asks again (re-checked whenever it returns to the foreground).
  const [keptInPage, setKeptInPage] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isClient || !savedTimeZone || !deviceZone) return null;
  const key = keepKey(userId, savedTimeZone, deviceZone);
  const keptAt = Math.max(keptInPage[key] ?? 0, storedKeepAt(key) ?? 0) || null;
  if (
    !shouldPromptTimezone({
      saved: savedTimeZone,
      device: deviceZone,
      online: isOnline,
      keptAt,
      now,
    })
  ) {
    return null;
  }

  function keep() {
    const at = Date.now();
    try {
      localStorage.setItem(key, String(at));
    } catch {
      // Not remembered across reloads; it will ask again next time.
    }
    setKeptInPage((kept) => ({ ...kept, [key]: at }));
  }

  async function switchZone() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: deviceZone, expectedTimezone: savedTimeZone }),
      });
      if (res.ok || res.status === 409) {
        // 409: changed elsewhere meanwhile — reload shows the real state.
        // Reload (not a soft refresh) so the calendar, the selected day and
        // every cached "today" restart on the new zone together.
        window.location.reload();
        return;
      }
      throw new Error();
    } catch {
      setError("Couldn't switch right now. Try again, or change it in Settings.");
      setBusy(false);
    }
  }

  const deviceLabel = timeZoneLabel(deviceZone);
  const savedLabel = timeZoneLabel(savedTimeZone);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-24 lg:pb-6 flex justify-center pointer-events-none">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tz-prompt-title"
        className="pointer-events-auto w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl space-y-3"
      >
        <p id="tz-prompt-title" className="text-sm font-semibold text-text-primary">
          🌍 You seem to be in {deviceLabel.split(" · ")[0]} now
        </p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Your account runs on {savedLabel}. Switch to {deviceLabel}? Only dates
          from now on follow the new time zone — your history stays as it is.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={switchZone}
            disabled={busy}
            className="flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Switching…" : `Use ${deviceLabel.split(" · ")[0]} time`}
          </button>
          <button
            type="button"
            onClick={keep}
            disabled={busy}
            className="flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Keep {savedLabel.split(" · ")[0]} time
          </button>
        </div>
      </div>
    </div>
  );
}
