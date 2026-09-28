"use client";

/**
 * Time zone picker — shared by onboarding (Step 1) and Settings.
 *
 * A native <select>: searchable by typing on every platform, accessible, and
 * nothing to download. Zones are grouped by region ("Asia", "Europe") and
 * shown as "Kolkata · GMT+5:30"; the stored value is the IANA name.
 *
 * `include` makes sure a stored or detected zone is always selectable even if
 * this runtime's list spells it differently (Asia/Calcutta vs Asia/Kolkata).
 *
 * BROWSER-ONLY LIST: the server's zone list (Node/ICU) and the browser's differ
 * in spelling and size, so rendering the options during SSR would mismatch on
 * hydration. Until mounted, a same-sized placeholder shows the current label.
 */

import { useMemo } from "react";
import { useIsClient } from "@/components/shared/timezone-provider";
import { cn } from "@/lib/utils/cn";
import {
  canonicalTimeZone,
  listTimeZones,
  sameTimeZone,
  timeZoneLabel,
} from "@/lib/utils/local-date";

const FIELD_CLASS = cn(
  "w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary",
  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
  "[color-scheme:dark] disabled:opacity-50"
);

export function TimezoneSelect({
  id,
  value,
  onChange,
  include = [],
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  include?: Array<string | null | undefined>;
  disabled?: boolean;
  className?: string;
}) {
  const mounted = useIsClient();

  const includeKey = include.filter(Boolean).join("|");
  const groups = useMemo(() => {
    if (!mounted) return [];
    const byRegion = new Map<string, Array<{ tz: string; label: string }>>();
    for (const tz of listTimeZones([value, ...includeKey.split("|")])) {
      const name = canonicalTimeZone(tz);
      const region = name.includes("/") ? name.split("/")[0] : "Other";
      const list = byRegion.get(region) ?? [];
      list.push({ tz, label: timeZoneLabel(tz) });
      byRegion.set(region, list);
    }
    return [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [mounted, value, includeKey]);

  if (!mounted) {
    return (
      <div id={id} className={cn(FIELD_CLASS, "text-text-muted", className)}>
        {value ? timeZoneLabel(value) : "Detecting…"}
      </div>
    );
  }

  // The option for `value` may be spelled differently (an alias) — select it.
  const selected =
    groups
      .flatMap(([, zones]) => zones)
      .find(({ tz }) => sameTimeZone(tz, value))?.tz ?? value;

  return (
    <select
      id={id}
      value={selected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD_CLASS, className)}
    >
      {groups.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map(({ tz, label }) => (
            <option key={tz} value={tz}>
              {label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
