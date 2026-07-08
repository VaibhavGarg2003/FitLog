"use client";

/**
 * Onboarding Shell — Wizard Container
 * ═════════════════════════════════════
 *
 * Controls the 5-step flow:
 * - Progress bar at the top
 * - Renders the current step component
 * - Handles the final submission
 * - Slide transition between steps
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { onboardingSchema } from "@/lib/validators/onboarding.schema";
import { Step1Identity } from "./step-1-identity";
import { Step2Body } from "./step-2-body";
import { Step3Activity } from "./step-3-activity";
import { Step4Goal } from "./step-4-goal";
import { Step5Preferences } from "./step-5-preferences";

const STEP_TITLES = [
  "Who are you?",
  "Your body",
  "Activity level",
  "Your goal",
  "Preferences",
];

export function OnboardingShell() {
  const router = useRouter();
  const { currentStep, formData, reset } = useOnboardingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    // Validate the complete form data
    const validation = onboardingSchema.safeParse(formData);
    if (!validation.success) {
      const firstError = Object.values(
        validation.error.flatten().fieldErrors
      )[0]?.[0];
      setError(firstError || "Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }

      // Success! Reset store and navigate to dashboard
      reset();
      router.push("/dashboard");
      router.refresh(); // Re-run server components to pick up new profile
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] flex flex-col px-4 py-6 max-w-lg mx-auto">
      {/* ── Progress Bar ── */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold font-[family-name:var(--font-outfit)] text-text-primary">
            {STEP_TITLES[currentStep - 1]}
          </h2>
          <span className="text-sm text-text-muted">
            {currentStep} / 5
          </span>
        </div>
        <div className="w-full h-2 bg-surface-alt rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(currentStep / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="flex-1">
        {currentStep === 1 && <Step1Identity />}
        {currentStep === 2 && <Step2Body />}
        {currentStep === 3 && <Step3Activity />}
        {currentStep === 4 && <Step4Goal />}
        {currentStep === 5 && (
          <Step5Preferences
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* ── Error Message ── */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
