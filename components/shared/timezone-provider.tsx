"use client";

/**
 * Timezone Provider — the ONE calendar the whole app uses
 * ═══════════════════════════════════════════════════════
 *
 * The saved time zone (profiles.timezone) decides what "today" is everywhere:
 * the date strip, the default selected day, new logs, goals, target history
 * and reports. The device's own clock only PROPOSES a change (see
 * TimezonePrompt); it never silently decides.
 *
 * Before an account has a saved zone (older accounts, until TimezoneSync
 * fills it), the device's zone is used — the same zone that will be saved.
 *
 * HYDRATION: pages are server-rendered, and the server can't know the device
 * zone or be trusted to agree on the day (a UTC server at 00:30 IST). Both the
 * device zone and "today" are read with useSyncExternalStore: during hydration
 * React uses the server snapshot (`initialToday`, no device zone), then
 * re-renders with the device's values — no mismatch, no setState-in-effect.
 *
 * REACTIVE "TODAY": re-read every minute and whenever the app returns to the
 * foreground, so the "Today" label rolls over at the user's midnight — there
 * is no timezone/midnight event to listen for. The SELECTED day is not moved
 * at midnight (an open workout belongs to the day it started); it is only
 * aligned once, when the store still holds the device's date.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useUIStore } from "@/stores/ui-store";
import {
  deviceTimeZone,
  isValidTimeZone,
  localDateStr,
  localDateStrInZone,
} from "@/lib/utils/local-date";

// ─────────────────────────────────────────────────────────────
// Device reads (browser-only, hydration-safe)
// ─────────────────────────────────────────────────────────────

/** Re-read on returning to the app: a phone can cross zones while in a pocket. */
function subscribeForeground(onChange: () => void) {
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onChange);
  };
}

/** Foreground changes plus a one-minute tick — enough to catch midnight. */
function subscribeClock(onChange: () => void) {
  const stopForeground = subscribeForeground(onChange);
  const timer = window.setInterval(onChange, 60_000);
  return () => {
    stopForeground();
    window.clearInterval(timer);
  };
}

const noSubscribe = () => () => {};

/** The zone this device reports; undefined on the server and during hydration. */
export function useDeviceTimeZone(): string | undefined {
  return useSyncExternalStore(subscribeForeground, deviceTimeZone, () => undefined);
}

/**
 * Current time rounded down to the minute, re-read every minute and on
 * returning to the app. Minute resolution keeps the snapshot stable between
 * reads (useSyncExternalStore requires that) and is plenty for day-scale rules.
 */
export function useMinuteClock(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => 0
  );
}

/** False on the server and during hydration, true after. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

// ─────────────────────────────────────────────────────────────
// The app's calendar
// ─────────────────────────────────────────────────────────────

interface TimezoneContextValue {
  /** The zone stored on the profile; null until it has been filled. */
  savedTimeZone: string | null;
  /** The zone the app runs on: saved, else this device's, else null (SSR). */
  timeZone: string | null;
  /** "YYYY-MM-DD" in `timeZone` — the app's "today". */
  today: string;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

function computeToday(timeZone: string | null): string {
  return timeZone && isValidTimeZone(timeZone)
    ? localDateStrInZone(timeZone)
    : localDateStr();
}

export function TimezoneProvider({
  savedTimeZone,
  initialToday,
  children,
}: {
  savedTimeZone: string | null;
  initialToday: string;
  children: ReactNode;
}) {
  const deviceZone = useDeviceTimeZone();
  const timeZone = savedTimeZone ?? deviceZone ?? null;

  const today = useSyncExternalStore(
    subscribeClock,
    () => computeToday(timeZone),
    () => initialToday
  );

  // Align the selected day ONCE: the store starts on the DEVICE's date (it is
  // created before any zone is known). If the user hasn't picked a day yet and
  // the app's today differs, move it. A day the user chose is never touched.
  useEffect(() => {
    if (!timeZone) return;
    const appToday = computeToday(timeZone);
    const { selectedDate, setSelectedDate } = useUIStore.getState();
    if (selectedDate === localDateStr() && selectedDate !== appToday) {
      setSelectedDate(appToday);
    }
  }, [timeZone]);

  const value = useMemo(
    () => ({ savedTimeZone, timeZone, today }),
    [savedTimeZone, timeZone, today]
  );

  return (
    <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
  );
}

/** The app's calendar: saved zone, effective zone and "today". */
export function useUserTimeZone(): TimezoneContextValue {
  const ctx = useContext(TimezoneContext);
  // Outside the signed-in app (onboarding, public pages) there is no saved
  // zone: fall back to the device.
  return ctx ?? { savedTimeZone: null, timeZone: null, today: localDateStr() };
}

/** "YYYY-MM-DD" today on the app's calendar. */
export function useUserToday(): string {
  return useUserTimeZone().today;
}
