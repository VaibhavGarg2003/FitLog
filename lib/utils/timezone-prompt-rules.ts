/**
 * Timezone prompt rules — WHEN to offer "switch to this device's time zone"
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Pure decisions, kept apart from the component so they are unit-tested
 * (components/shared/timezone-prompt.tsx is the only caller).
 */

import { canonicalTimeZone, sameTimeZone } from "@/lib/utils/local-date";

/** How long a "Keep my time zone" answer suppresses the prompt. */
export const KEEP_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Storage key for a "Keep" answer: per account, per saved zone, per device
 * zone. Another account on the same browser is still asked; a different
 * device zone (a new trip) asks again; a zone changed on another device makes
 * the old answer irrelevant. Aliases share a key.
 */
export function keepKey(userId: string, saved: string, device: string): string {
  return `fitlog:tz-keep:${userId}:${canonicalTimeZone(saved)}:${canonicalTimeZone(device)}`;
}

/** A "Keep" answered at `keptAt` still holds at `now` (expires after 14 days). */
export function isKeepActive(keptAt: number | null | undefined, now: number): boolean {
  return (
    typeof keptAt === "number" &&
    Number.isFinite(keptAt) &&
    keptAt > 0 &&
    now - keptAt < KEEP_FOR_MS
  );
}

/**
 * Offer the switch only when: an account zone is saved, the device reports a
 * zone for a DIFFERENT place (never an alias; never compared by offset), the
 * device is online (the switch needs the server), and no unexpired "Keep".
 */
export function shouldPromptTimezone(input: {
  saved: string | null | undefined;
  device: string | null | undefined;
  online: boolean;
  keptAt: number | null | undefined;
  now: number;
}): boolean {
  const { saved, device, online, keptAt, now } = input;
  if (!saved || !device || !online) return false;
  if (sameTimeZone(saved, device)) return false;
  return !isKeepActive(keptAt, now);
}
