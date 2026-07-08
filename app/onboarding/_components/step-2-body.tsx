"use client";

import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { step2Schema } from "@/lib/validators/onboarding.schema";
import { cn } from "@/lib/utils/cn";

export function Step2Body() {
  const { formData, updateFormData, nextStep, prevStep } =
    useOnboardingStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleNext() {
    const validation = step2Schema.safeParse({
      weightKg: formData.weightKg,
      heightCm: formData.heightCm,
    });

    if (!validation.success) {
      const fieldErrors = validation.error.flatten().fieldErrors;
      const mapped: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (msgs?.[0]) mapped[key] = msgs[0];
      }
      setErrors(mapped);
      return;
    }

    setErrors({});
    nextStep();
  }

  return (
    <div className="space-y-6">
      {/* Weight */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Current Weight
        </label>
        <div className="relative">
          <input
            id="onboarding-weight"
            type="number"
            step="0.1"
            placeholder="70"
            value={formData.weightKg ?? ""}
            onChange={(e) =>
              updateFormData({
                weightKg: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
            className={cn(
              "w-full px-4 py-3 pr-12 bg-surface border rounded-xl text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
              "transition-all",
              errors.weightKg ? "border-red-500" : "border-border"
            )}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            kg
          </span>
        </div>
        {errors.weightKg && (
          <p className="mt-1 text-sm text-red-400">{errors.weightKg}</p>
        )}
      </div>

      {/* Height */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Height
        </label>
        <div className="relative">
          <input
            id="onboarding-height"
            type="number"
            step="0.1"
            placeholder="170"
            value={formData.heightCm ?? ""}
            onChange={(e) =>
              updateFormData({
                heightCm: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
            className={cn(
              "w-full px-4 py-3 pr-12 bg-surface border rounded-xl text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
              "transition-all",
              errors.heightCm ? "border-red-500" : "border-border"
            )}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">
            cm
          </span>
        </div>
        {errors.heightCm && (
          <p className="mt-1 text-sm text-red-400">{errors.heightCm}</p>
        )}
      </div>

      {/* BMI Preview */}
      {formData.weightKg && formData.heightCm && (
        <div className="p-4 bg-surface-alt rounded-xl border border-border">
          <p className="text-sm text-text-muted">Your BMI</p>
          <p className="text-2xl font-bold text-text-primary">
            {(
              formData.weightKg /
              (formData.heightCm / 100) ** 2
            ).toFixed(1)}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {(() => {
              const bmi =
                formData.weightKg / (formData.heightCm / 100) ** 2;
              if (bmi < 18.5) return "Underweight";
              if (bmi < 25) return "Normal weight";
              if (bmi < 30) return "Overweight";
              return "Obese";
            })()}
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
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
          className="flex-1 py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
