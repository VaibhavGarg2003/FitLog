"use client";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { cn } from "@/lib/utils/cn";

const DIETARY_OPTIONS = [
  { value: "VEG" as const, emoji: "🥬", title: "Vegetarian" },
  { value: "NON_VEG" as const, emoji: "🍗", title: "Non-Vegetarian" },
  { value: "EGGETARIAN" as const, emoji: "🥚", title: "Eggetarian" },
  { value: "VEGAN" as const, emoji: "🌱", title: "Vegan" },
];

const STRICTNESS_OPTIONS = [
  {
    value: "RELAXED" as const,
    emoji: "😊",
    title: "Relaxed",
    description: "Encouraging and gentle feedback",
  },
  {
    value: "MODERATE" as const,
    emoji: "📊",
    title: "Moderate",
    description: "Balanced — facts with encouragement",
  },
  {
    value: "STRICT" as const,
    emoji: "🔥",
    title: "Strict",
    description: "Direct and brutally honest feedback",
  },
];

interface Step5Props {
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function Step5Preferences({ onSubmit, isSubmitting }: Step5Props) {
  const { formData, updateFormData, prevStep } = useOnboardingStore();

  const canSubmit = !!formData.dietaryType;

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Dietary Type — 2×2 phone, 4-up laptop */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Dietary Preference
        </label>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {DIETARY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              id={`onboarding-diet-${opt.value.toLowerCase().replace("_", "-")}`}
              onClick={() => updateFormData({ dietaryType: opt.value })}
              className={cn(
                "p-3 lg:p-5 rounded-xl border-2 text-center transition-all duration-200",
                formData.dietaryType === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-text-muted"
              )}
            >
              <span className="text-xl lg:text-2xl block mb-1">{opt.emoji}</span>
              <span
                className={cn(
                  "text-sm font-medium",
                  formData.dietaryType === opt.value
                    ? "text-primary"
                    : "text-text-secondary"
                )}
              >
                {opt.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Strictness — 3 columns on laptop */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Feedback Style
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          {STRICTNESS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              id={`onboarding-strictness-${opt.value.toLowerCase()}`}
              onClick={() => updateFormData({ strictness: opt.value })}
              className={cn(
                "w-full p-3 lg:p-4 rounded-xl border-2 text-left transition-all duration-200 flex sm:flex-col items-center sm:items-start gap-3",
                formData.strictness === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-text-muted"
              )}
            >
              <span className="text-xl">{opt.emoji}</span>
              <div>
                <p
                  className={cn(
                    "font-medium text-sm",
                    formData.strictness === opt.value
                      ? "text-primary"
                      : "text-text-primary"
                  )}
                >
                  {opt.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {opt.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-1">
        <button
          type="button"
          onClick={prevStep}
          disabled={isSubmitting}
          className="sm:min-w-[8rem] py-3 px-6 bg-background border border-border text-text-secondary font-semibold rounded-xl hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className={cn(
            "sm:min-w-[12rem] py-3 px-6 font-semibold rounded-xl transition-all duration-200",
            canSubmit && !isSubmitting
              ? "bg-gradient-to-r from-primary to-accent text-white hover:opacity-90"
              : "bg-border text-text-muted cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            "Complete Setup"
          )}
        </button>
      </div>
    </div>
  );
}
