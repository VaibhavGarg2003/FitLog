/**
 * Zustand UI Store — Global Client State
 * ═══════════════════════════════════════
 *
 * WHAT IS ZUSTAND?
 * ────────────────
 * Zustand is a tiny state management library. It creates a "store"
 * — a single object that holds state and functions to change it.
 * Any component can read from or write to this store.
 *
 * WHAT GOES IN ZUSTAND vs TANSTACK QUERY?
 * ────────────────────────────────────────
 * Zustand = CLIENT-ONLY state (lives in browser, not in database)
 *   - Is the sidebar open? → Zustand
 *   - What date is selected? → Zustand
 *   - Is an active workout running? → Zustand
 *
 * TanStack Query = SERVER state (data from the database)
 *   - User's meals today → TanStack Query
 *   - Workout history → TanStack Query
 *   - Profile data → TanStack Query
 *
 * HOW `create()` WORKS:
 * ─────────────────────
 * `create<Type>()((set, get) => ({ ... }))` creates a store.
 * - `set()` — updates the state. Must return a new object (immutability).
 * - `get()` — reads the current state inside actions.
 *
 * The (set, get) => ({ ... }) pattern is a "state creator function."
 * It returns an object with:
 *   1. State values (selectedDate, isMobileNavOpen, etc.)
 *   2. Action functions (setSelectedDate, toggleMobileNav, etc.)
 *
 * USAGE IN COMPONENTS:
 * ────────────────────
 *   import { useUIStore } from "@/stores/ui-store";
 *   const selectedDate = useUIStore((state) => state.selectedDate);
 *   const setDate = useUIStore((state) => state.setSelectedDate);
 *
 * The (state) => state.selectedDate is a "selector function."
 * It tells Zustand: "only re-render this component when
 * selectedDate changes." If isMobileNavOpen changes but
 * selectedDate doesn't, this component does NOT re-render.
 * This is Zustand's key performance feature.
 */
import { create } from "zustand";
import { localDateStr } from "@/lib/utils/local-date";

interface UIState {
  // ── State ──
  selectedDate: string; // ISO date string "2026-07-03"
  isMobileNavOpen: boolean;
  isActiveWorkout: boolean; // Is a live workout session running?
  activeWorkoutId: string | null;

  // ── Actions ──
  setSelectedDate: (date: string) => void;
  toggleMobileNav: () => void;
  setMobileNavOpen: (isOpen: boolean) => void;
  startWorkout: (sessionId: string) => void;
  endWorkout: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  // Initial state
  selectedDate: localDateStr(),
  // localDateStr() returns the LOCAL date (e.g. "2026-07-08" in IST).
  // NOT new Date().toISOString().split("T")[0] which gives UTC ("2026-07-07" at IST midnight).

  isMobileNavOpen: false,
  isActiveWorkout: false,
  activeWorkoutId: null,

  // Actions — each returns a new state object via set()
  setSelectedDate: (date) => set({ selectedDate: date }),

  toggleMobileNav: () =>
    set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  // When toggling, we need the CURRENT value to flip it.
  // So we pass a function to set() that receives current state.

  setMobileNavOpen: (isOpen) => set({ isMobileNavOpen: isOpen }),

  startWorkout: (sessionId) =>
    set({ isActiveWorkout: true, activeWorkoutId: sessionId }),

  endWorkout: () =>
    set({ isActiveWorkout: false, activeWorkoutId: null }),
}));
