"use client";

import { useState } from "react";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { step2Schema } from "@/lib/validators/onboarding.schema";
import { cn } from "@/lib/utils/cn";

/** Parse input as a non-negative number, or undefined when empty. */
function parseNonNegative(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return undefined;
  // Prevent negative values from spinner or typed input
  return Math.max(0, n);
}

/** Real-time field error from Zod step2Schema for a single field. */
function fieldError(
  field: "weightKg" | "heightCm",
  value: number | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const validation = step2Schema.safeParse({
    weightKg: field === "weightKg" ? value : 70,
    heightCm: field === "heightCm" ? value : 170,
  });
  if (validation.success) return undefined;
  return validation.error.flatten().fieldErrors[field]?.[0];
}

export function Step2Body() {
  const { formData, updateFormData, nextStep, prevStep } =
    useOnboardingStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleWeightChange(raw: string) {
    const weightKg = parseNonNegative(raw);
    updateFormData({ weightKg });
    setErrors((prev) => {
      const next = { ...prev };
      const err = fieldError("weightKg", weightKg);
      if (err) next.weightKg = err;
      else delete next.weightKg;
      return next;
    });
  }

  function handleHeightChange(raw: string) {
    const heightCm = parseNonNegative(raw);
    updateFormData({ heightCm });
    setErrors((prev) => {
      const next = { ...prev };
      const err = fieldError("heightCm", heightCm);
      if (err) next.heightCm = err;
      else delete next.heightCm;
      return next;
    });
  }

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

  // Only show BMI when both values are within valid schema ranges
  const weightValid =
    formData.weightKg !== undefined &&
    formData.weightKg >= 30 &&
    formData.weightKg <= 300;
  const heightValid =
    formData.heightCm !== undefined &&
    formData.heightCm >= 100 &&
    formData.heightCm <= 250;

  const bmi =
    weightValid && heightValid
      ? formData.weightKg! / (formData.heightCm! / 100) ** 2
      : null;

  const bmiLabel =
    bmi === null
      ? null
      : bmi < 18.5
        ? "Underweight"
        : bmi < 25
          ? "Normal weight"
          : bmi < 30
            ? "Overweight"
            : "Obese";

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:items-start">
        {/* Weight */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Current Weight
          </label>
          <div className="relative">
            <input
              id="onboarding-weight"
              type="number"
              step="1"
              min={0}
              max={300}
              placeholder="70"
              value={formData.weightKg ?? ""}
              onChange={(e) => handleWeightChange(e.target.value)}
              className={cn(
                "w-full px-4 py-3 pr-12 bg-background border rounded-xl text-text-primary placeholder:text-text-muted",
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
              step="1"
              min={0}
              max={250}
              placeholder="170"
              value={formData.heightCm ?? ""}
              onChange={(e) => handleHeightChange(e.target.value)}
              className={cn(
                "w-full px-4 py-3 pr-12 bg-background border rounded-xl text-text-primary placeholder:text-text-muted",
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

        {/* BMI Preview — full width under inputs on laptop; only when in-range */}
        {bmi !== null && (
          <div className="sm:col-span-2 p-4 lg:p-5 bg-background rounded-xl border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm text-text-muted">Your BMI</p>
              <p className="text-2xl lg:text-3xl font-bold text-text-primary">
                {bmi.toFixed(1)}
              </p>
            </div>
            <p className="text-sm font-medium text-primary sm:text-right">
              {bmiLabel}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <button
          type="button"
          onClick={prevStep}
          className="sm:min-w-[8rem] py-3 px-6 bg-background border border-border text-text-secondary font-semibold rounded-xl hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="sm:min-w-[12rem] py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
