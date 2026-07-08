"use client";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { cn } from "@/lib/utils/cn";

const ACTIVITY_OPTIONS = [
  {
    value: "SEDENTARY" as const,
    emoji: "🪑",
    title: "Sedentary",
    description: "Desk job, little to no exercise",
  },
  {
    value: "LIGHT" as const,
    emoji: "🚶",
    title: "Lightly Active",
    description: "Light exercise 1-3 days/week",
  },
  {
    value: "MODERATE" as const,
    emoji: "🏃",
    title: "Moderately Active",
    description: "Moderate exercise 3-5 days/week",
  },
  {
    value: "ACTIVE" as const,
    emoji: "💪",
    title: "Very Active",
    description: "Hard exercise 6-7 days/week",
  },
  {
    value: "VERY_ACTIVE" as const,
    emoji: "🏋️",
    title: "Extremely Active",
    description: "Athlete or physical job + daily training",
  },
];

export function Step3Activity() {
  const { formData, updateFormData, nextStep, prevStep } =
    useOnboardingStore();

  function handleSelect(value: typeof ACTIVITY_OPTIONS[number]["value"]) {
    updateFormData({ activityLevel: value });
  }

  function handleNext() {
    if (!formData.activityLevel) return;
    nextStep();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted mb-2">
        This affects your daily calorie target. Be honest — overestimating
        leads to eating too much, underestimating leads to frustration.
      </p>

      {ACTIVITY_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          id={`onboarding-activity-${opt.value.toLowerCase()}`}
          onClick={() => handleSelect(opt.value)}
          className={cn(
            "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
            formData.activityLevel === opt.value
              ? "border-primary bg-primary/10"
              : "border-border bg-surface hover:border-text-muted"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{opt.emoji}</span>
            <div>
              <p
                className={cn(
                  "font-semibold",
                  formData.activityLevel === opt.value
                    ? "text-primary"
                    : "text-text-primary"
                )}
              >
                {opt.title}
              </p>
              <p className="text-sm text-text-muted">{opt.description}</p>
            </div>
          </div>
        </button>
      ))}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={prevStep}
          className="flex-1 py-3 px-6 bg-surface border border-border text-text-secondary font-semibold rounded-xl hover:bg-surface-alt transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!formData.activityLevel}
          className={cn(
            "flex-1 py-3 px-6 font-semibold rounded-xl transition-colors",
            formData.activityLevel
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-surface-alt text-text-muted cursor-not-allowed"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
