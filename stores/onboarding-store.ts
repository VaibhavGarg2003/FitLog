/**
 * Onboarding Store (Zustand)
 * ══════════════════════════
 *
 * Holds all wizard answers as the user progresses through steps.
 * Nothing is saved to the DATABASE until the user clicks "Complete" on the
 * final step — but progress IS mirrored to localStorage so an accidental
 * reload (or a browser crash) doesn't send the user back to step 1.
 *
 * WHY ZUSTAND AND NOT useState?
 * ─────────────────────────────
 * The wizard has 5 steps, each in a separate component.
 * With useState, each component would only know its own data.
 * When the user goes back to step 2, their step 1 data would be lost.
 *
 * Zustand is a global store: all steps read and write to the same data.
 * Going back and forth between steps preserves everything.
 *
 * The store is reset after successful submission.
 *
 * WHY skipHydration?
 * ──────────────────
 * Reading localStorage is synchronous, so by default the store would restore
 * to (say) step 3 before React hydrates — while the server-rendered HTML still
 * shows step 1. React sees the two disagree and throws a hydration error.
 * Instead the wizard calls persist.rehydrate() inside an effect and waits for
 * `hasHydrated` before rendering any step.
 *
 * WHY userId?
 * ───────────
 * It stamps whose progress this is. Two accounts sharing a browser must never
 * resume into each other's half-filled form, so a mismatch wipes the data.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OnboardingFormData } from "@/lib/validators/onboarding.schema";

interface OnboardingState {
  // Current step (1-5)
  currentStep: number;

  // Form data (partial — filled as user progresses)
  formData: Partial<OnboardingFormData>;

  // Owner of the saved progress
  userId: string | null;

  // False until localStorage has been read back. Not persisted.
  hasHydrated: boolean;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: (data: Partial<OnboardingFormData>) => void;
  reset: () => void;
  claimForUser: (userId: string) => void;
  setHasHydrated: (value: boolean) => void;
}

const INITIAL_FORM_DATA: Partial<OnboardingFormData> = {
  strictness: "MODERATE",
  unitSystem: "METRIC",
  // Schema minimums so body inputs show valid starting values on first visit
  weightKg: 30,
  heightCm: 100,
};

export const ONBOARDING_STORAGE_KEY = "fitlog-onboarding-progress";

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      currentStep: 1,
      formData: { ...INITIAL_FORM_DATA },
      userId: null,
      hasHydrated: false,

      setStep: (step) => set({ currentStep: step }),

      nextStep: () =>
        set((state) => ({
          currentStep: Math.min(5, state.currentStep + 1),
        })),

      prevStep: () =>
        set((state) => ({
          currentStep: Math.max(1, state.currentStep - 1),
        })),

      updateFormData: (data) =>
        set((state) => ({
          formData: { ...state.formData, ...data },
        })),

      reset: () =>
        set({
          currentStep: 1,
          formData: { ...INITIAL_FORM_DATA },
        }),

      // Restored progress belonging to a different account is discarded.
      claimForUser: (userId) => {
        if (get().userId === userId) return;
        set({
          userId,
          currentStep: 1,
          formData: { ...INITIAL_FORM_DATA },
        });
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
        userId: state.userId,
      }),
    }
  )
);
