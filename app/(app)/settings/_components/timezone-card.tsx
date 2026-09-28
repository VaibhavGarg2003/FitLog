"use client";

/**
 * Time Zone Card (Settings)
 * ═════════════════════════
 *
 * Shows the account's time zone — the calendar every "today" in the app comes
 * from — and lets the user change it deliberately. Offers a one-tap "use this
 * device's" when the device reports a different zone.
 *
 * Saving is a compare-and-set against the zone this card showed
 * (expectedTimezone): if another device changed it meanwhile, the server
 * answers 409 and the page reloads rather than overwriting that choice. A
 * successful save reloads too, so the date strip, the selected day and every
 * cached "today" restart on the new zone together.
 *
 * Past logs, goals and history keep their dates — only dates decided from now
 * on follow the new zone.
 */

import { useState } from "react";
import {
  useDeviceTimeZone,
  useUserTimeZone,
} from "@/components/shared/timezone-provider";
import { TimezoneSelect } from "@/components/shared/timezone-select";
import { sameTimeZone, timeZoneLabel } from "@/lib/utils/local-date";

export function TimezoneCard() {
  const { savedTimeZone, timeZone } = useUserTimeZone();
  const deviceZone = useDeviceTimeZone();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const current = savedTimeZone ?? timeZone;
  const deviceDiffers =
    !!deviceZone && !!current && !sameTimeZone(deviceZone, current);

  async function save(next: string) {
    if (current && sameTimeZone(next, current)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: next, expectedTimezone: savedTimeZone }),
      });
      if (res.ok || res.status === 409) {
        window.location.reload();
        return;
      }
      throw new Error();
    } catch {
      setError("Could not save the time zone. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-5 lg:p-6 border border-border space-y-3">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Time Zone
      </h2>

      {!editing && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-text-muted">Your days follow</span>
            <span className="text-sm font-semibold text-text-primary text-right">
              {current ? timeZoneLabel(current) : "Detecting…"}
            </span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Decides which day your logs, goals and reports fall on. Changing it
            only affects dates from now on.
          </p>
          {deviceDiffers && (
            <button
              type="button"
              onClick={() => save(deviceZone!)}
              disabled={busy}
              className="w-full py-2 px-4 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : `Use this device's: ${timeZoneLabel(deviceZone!)}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setChoice(current ?? deviceZone ?? "");
              setError("");
              setEditing(true);
            }}
            disabled={busy}
            className="w-full py-2 px-4 rounded-xl text-sm font-medium border border-border text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            Change time zone
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <TimezoneSelect
            id="settings-timezone"
            value={choice}
            include={[current, deviceZone]}
            onChange={setChoice}
            disabled={busy}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save(choice)}
              disabled={busy || !choice}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="py-2.5 px-4 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
