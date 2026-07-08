/**
 * Onboarding Store (Zustand)
 * ══════════════════════════
 *
 * Holds all wizard answers in memory as the user progresses through steps.
 * This is CLIENT-SIDE ONLY state — nothing is saved to the database
 * until the user clicks "Complete" on the final step.
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
 */

import { create } from "zustand";
import type { OnboardingFormData } from "@/lib/validators/onboarding.schema";

interface OnboardingState {
  // Current step (1-5)
  currentStep: number;

  // Form data (partial — filled as user progresses)
  formData: Partial<OnboardingFormData>;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: (data: Partial<OnboardingFormData>) => void;
  reset: () => void;
}

const INITIAL_FORM_DATA: Partial<OnboardingFormData> = {
  strictness: "MODERATE",
  unitSystem: "METRIC",
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  formData: { ...INITIAL_FORM_DATA },

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
}));
