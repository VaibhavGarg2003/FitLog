/**
 * useDebounce — Delay a rapidly-changing value
 * ════════════════════════════════════════════
 *
 * Returns a copy of `value` that only updates after `delayMs` have passed
 * without a new change. Typing "roti" updates the input instantly (responsive
 * UI) but the debounced value settles once — so downstream effects like the
 * food search fire a single request instead of one per keystroke.
 */

"use client";

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
